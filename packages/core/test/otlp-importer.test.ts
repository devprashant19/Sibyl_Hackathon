import { describe, it, expect } from 'vitest';
import { OtlpImporter, OtlpTrace } from '../src/importers/otlp';

describe('OTLP Trace Importer', () => {
  it('parses realistic OTLP JSON and extracts valid fault templates', () => {
    const mockTrace: OtlpTrace = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '123',
                  spanId: 'abc',
                  name: 'SELECT balance FROM accounts',
                  startTimeUnixNano: '1690000000000000000',
                  // Exactly 45ms later (45 * 1,000,000 ns)
                  endTimeUnixNano:   '1690000000045000000',
                  attributes: [
                    { key: 'db.system', value: { stringValue: 'postgresql' } }
                  ]
                },
                {
                  traceId: '123',
                  spanId: 'def',
                  name: 'POST /checkout',
                  startTimeUnixNano: '1690000000045000000',
                  // 120ms later, but with an error status! (120 * 1,000,000 ns)
                  endTimeUnixNano:   '1690000000165000000',
                  attributes: [
                    { key: 'http.method', value: { stringValue: 'POST' } },
                    { key: 'http.url', value: { stringValue: 'https://api.example.com/checkout' } }
                  ],
                  status: { code: 2 } // 2 = ERROR in OTLP
                }
              ]
            }
          ]
        }
      ]
    };

    const importer = new OtlpImporter({ latencyFuzzFactor: 0.2, reproduceErrors: true });
    const templates = importer.parse(mockTrace);

    expect(templates).toHaveLength(2);

    // Assert DB Template
    const dbTemplate = templates.find(t => t.spec.domain === 'DATABASE')!;
    expect(dbTemplate).toBeDefined();
    expect(dbTemplate.spec.type).toBe('SLOW_QUERY'); // default for DB when status != ERROR
    expect(dbTemplate.target).toEqual({ query: 'SELECT balance FROM accounts' });
    
    // Latency was 45ms. 20% fuzz means 36ms to 54ms.
    expect(dbTemplate.delayMsRange).toEqual([36, 54]);

    // Assert HTTP Error Template
    const httpTemplate = templates.find(t => t.spec.domain === 'HTTP')!;
    expect(httpTemplate).toBeDefined();
    expect(httpTemplate.spec.type).toBe('500_ERROR'); // Because status.code === 2
    expect(httpTemplate.target).toEqual({ url: 'https://api.example.com/checkout' });
    
    // Latency was 120ms. 20% fuzz means 96ms to 144ms.
    expect(httpTemplate.delayMsRange).toEqual([96, 144]);
  });
});
