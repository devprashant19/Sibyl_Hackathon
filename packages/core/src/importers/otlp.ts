import { FaultScheduleTemplate, FaultDomain } from '@sibyl/shared';
import * as crypto from 'crypto';

export interface OtlpTrace {
  resourceSpans?: {
    resource?: {
      attributes?: { key: string; value: { stringValue?: string; intValue?: number } }[];
    };
    scopeSpans?: {
      spans?: OtlpSpan[];
    }[];
  }[];
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind?: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: { key: string; value: { stringValue?: string; intValue?: number } }[];
  status?: { code: number; message?: string };
}

export interface OtlpImporterConfig {
  /**
   * Generates a delayMsRange around the observed latency.
   * e.g., 0.2 means [observed * 0.8, observed * 1.2]
   */
  latencyFuzzFactor?: number;
  
  /**
   * If true, generates error faults (e.g. HTTP_5XX, CONNECTION_DROP) if the span has status.code === 2 (ERROR).
   */
  reproduceErrors?: boolean;
}

export class OtlpImporter {
  constructor(private config: OtlpImporterConfig = { latencyFuzzFactor: 0.2, reproduceErrors: true }) {}

  parse(traceData: OtlpTrace): FaultScheduleTemplate[] {
    const templates: FaultScheduleTemplate[] = [];

    if (!traceData.resourceSpans) return templates;

    for (const rs of traceData.resourceSpans) {
      if (!rs.scopeSpans) continue;

      for (const ss of rs.scopeSpans) {
        if (!ss.spans) continue;

        for (const span of ss.spans) {
          const t = this.mapSpanToTemplate(span);
          if (t) templates.push(t);
        }
      }
    }

    return templates;
  }

  private mapSpanToTemplate(span: OtlpSpan): FaultScheduleTemplate | null {
    const attrs = new Map<string, string | number>();
    if (span.attributes) {
      for (const attr of span.attributes) {
        if (attr.value.stringValue !== undefined) attrs.set(attr.key, attr.value.stringValue);
        else if (attr.value.intValue !== undefined) attrs.set(attr.key, attr.value.intValue);
      }
    }

    let domain: FaultDomain | null = null;
    let faultType = '';
    const target: Record<string, any> = {};

    // 1. Identify Domain & Target from Semantic Conventions
    if (attrs.has('db.system')) {
      domain = 'DATABASE';
      target.query = attrs.get('db.statement') || span.name;
    } else if (attrs.has('http.method')) {
      domain = 'HTTP';
      // Fallback: url -> route -> span name
      target.url = attrs.get('http.url') || attrs.get('http.route') || span.name; 
    } else if (attrs.has('messaging.system')) {
      domain = 'MESSAGE_QUEUE';
      target.topic = attrs.get('messaging.destination') || span.name;
    } else if (attrs.has('rpc.system')) {
      domain = 'GRPC';
      // The gRPC driver matches on `method` (the full /package.Service/Method path).
      const service = attrs.get('rpc.service');
      const method = attrs.get('rpc.method');
      target.method = service && method ? `/${service}/${method}` : span.name;
    }

    if (!domain) return null; // We only create templates for known dependency domains

    // 2. Identify Fault Type
    // If reproduceErrors is true and span has an error status, we inject a failure
    if (this.config.reproduceErrors && span.status && span.status.code === 2) {
      switch (domain) {
        // Must be real fault types from @sibyl/shared: '500_ERROR' and 'DISCONNECT' were not, so
        // every template generated from an errored span failed schedule validation.
        case 'HTTP': faultType = 'HTTP_5XX'; break;
        case 'DATABASE': faultType = 'CONNECTION_DROP'; break;
        case 'MESSAGE_QUEUE': faultType = 'MESSAGE_LOSS'; break;
        case 'GRPC': faultType = 'UNAVAILABLE'; break;
      }
    } else {
      // Otherwise, we inject a latency fuzzing fault by default
      switch (domain) {
        case 'HTTP': faultType = 'TIMEOUT'; break;
        case 'DATABASE': faultType = 'SLOW_QUERY'; break;
        case 'MESSAGE_QUEUE': faultType = 'MESSAGE_DELAY'; break;
        case 'GRPC': faultType = 'DEADLINE_EXCEEDED'; break;
      }
    }

    // 3. Derive Delay Bounds
    let durationMs = 0;
    try {
      // BigInt(undefined) throws; spans exported without timestamps still yield a template.
      if (span.startTimeUnixNano && span.endTimeUnixNano) {
        durationMs = Number((BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / BigInt(1_000_000));
      }
    } catch {
      durationMs = 0;
    }
    
    // Fallback to 1ms if 0
    const baseMs = Math.max(durationMs, 1);
    
    const fuzz = this.config.latencyFuzzFactor || 0.2;
    const minDelay = Math.max(Math.floor(baseMs * (1 - fuzz)), 1);
    const maxDelay = Math.ceil(baseMs * (1 + fuzz));

    return {
      id: crypto.randomUUID(),
      spec: {
        domain,
        type: faultType
      },
      probabilityRange: [0.1, 1.0], // Default wide probability
      delayMsRange: [minDelay, maxDelay],
      target
    };
  }
}
