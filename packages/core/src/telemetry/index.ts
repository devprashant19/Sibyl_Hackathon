import type { Tracer, Meter } from '@opentelemetry/api';

let trace: any;
let metrics: any;
try {
  const api = require('@opentelemetry/api');
  trace = api.trace;
  metrics = api.metrics;
} catch (e) {
  trace = { getTracer: () => ({ startActiveSpan: (n: any, o: any, cb: any) => cb({ setStatus: ()=>{}, recordException: ()=>{}, end: ()=>{} }) }) };
  metrics = { getMeter: () => ({ createObservableGauge: ()=>({addCallback:()=>{}}), createHistogram: ()=>({record:()=>{}}), createCounter: ()=>({add:()=>{}}) }) };
}

let isInitialized = false;
let tracer: Tracer;
let meter: Meter;

// Define standardized OTel Metric Instruments
let queueDepthGauge: any;
let sandboxLatencyHistogram: any;
let searchSessionHistogram: any;
let agentCostCounter: any;

export class Telemetry {
  
  public static init() {
    if (isInitialized) return;

    console.log('[Telemetry] Initializing OpenTelemetry tracing and metrics...');
    
    // Fallback to global no-op providers if the SDK isn't fully bootstrapped by the consumer
    tracer = trace.getTracer('sibyl-core');
    meter = metrics.getMeter('sibyl-core');

    // Meters
    queueDepthGauge = meter.createObservableGauge('sibyl.queue.depth', {
      description: 'Current number of simulation runs queued',
    });

    sandboxLatencyHistogram = meter.createHistogram('sibyl.sandbox.cold_start_ms', {
      description: 'Time taken to boot a Docker sandbox',
      unit: 'ms',
    });

    searchSessionHistogram = meter.createHistogram('sibyl.search.session_ms', {
      description: 'Time taken for a search session to complete',
      unit: 'ms',
    });

    agentCostCounter = meter.createCounter('sibyl.agent.cost_cents', {
      description: 'Cumulative LLM API cost in cents',
    });

    isInitialized = true;
  }

  // --- Tracing Helpers ---

  /**
   * Starts an active span for tracing the lifecycle of a simulation run.
   */
  public static startRunSpan<T>(runId: string, phase: 'queued' | 'sandboxed' | 'executed' | 'ingested', fn: () => Promise<T>): Promise<T> {
    if (!isInitialized) this.init();
    return tracer.startActiveSpan(`run.${phase}`, { attributes: { runId } }, async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: 1 }); // OK
        return result;
      } catch (err: any) {
        span.recordException(err);
        span.setStatus({ code: 2, message: err.message }); // ERROR
        throw err;
      } finally {
        span.end();
      }
    });
  }

  // --- Metric Helpers ---

  public static recordQueueDepth(depth: number) {
    if (!isInitialized) this.init();
    queueDepthGauge.addCallback((result: any) => {
      result.observe(depth);
    });
  }

  public static recordSandboxLatency(ms: number) {
    if (!isInitialized) this.init();
    sandboxLatencyHistogram.record(ms);
  }

  public static recordSearchSessionDuration(ms: number, strategy: string) {
    if (!isInitialized) this.init();
    searchSessionHistogram.record(ms, { strategy });
  }

  public static recordAgentCost(cents: number, agentType: string) {
    if (!isInitialized) this.init();
    agentCostCounter.add(cents, { agentType });
  }
}
