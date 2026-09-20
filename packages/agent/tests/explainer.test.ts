import { describe, it, expect, vi } from 'vitest';
import { SibylExplainer } from '../src/explainer';
import { findUngroundedReferences } from '../src/grounding';

// Mock Anthropic SDK for two-phase calls
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockImplementation(async (args: any) => {
          const userMessage = args.messages.find((m: any) => m.role === 'user').content;
          
          if (userMessage.includes("strict grounding validator")) {
            // Phase 2: Grounding
            if (userMessage.includes("hallucinated DB crash")) {
              return {
                content: [{ type: "text", text: "Alert triggered: Promise failed. The HTTP timeout broke the idempotency. (Removed ungrounded DB crash claim)." }],
                usage: { input_tokens: 10, output_tokens: 10 }
              };
            }
            // Identity return for clean narrative
            const narrativeMatch = userMessage.match(/Narrative:\n([\s\S]*?)\n\nRaw Telemetry:/);
            const narrative = narrativeMatch ? narrativeMatch[1] : "Validated narrative";
            return {
              content: [{ type: "text", text: narrative }],
              usage: { input_tokens: 10, output_tokens: 10 }
            };
          }

          // Phase 1: Drafting
          if (userMessage.includes("hallucinate")) {
            return {
              content: [{ type: "text", text: "Alert triggered: Promise failed. The HTTP timeout broke the idempotency. Also a hallucinated DB crash happened." }],
              usage: { input_tokens: 10, output_tokens: 10 }
            };
          }

          return {
            content: [{ type: "text", text: "Alert triggered: Promise no_500s failed. The HTTP timeout to api.stripe.com caused the handler to throw an uncaught error." }],
            usage: { input_tokens: 10, output_tokens: 10 }
          };
        })
      };
    }
  };
});

describe('SibylExplainer', () => {
  const explainer = new SibylExplainer({ apiKey: 'mock-key' });

  it('should generate a grounded narrative and pass validation without changes', async () => {
    const explanation = await explainer.explainFailure('mock-run', [{ type: 'HTTP_REQUEST' }], { name: 'no_500s' });
    expect(explanation).toContain('api.stripe.com');
  });

  it('should remove hallucinated claims during the validation phase', async () => {
    // We pass a special keyword "hallucinate" in the evidence to trigger the mock
    const explanation = await explainer.explainFailure('mock-run', [], { test: 'hallucinate' });
    expect(explanation).toContain('Removed ungrounded DB crash claim');
  });

  it('reports grounding: identifiers present in the events are grounded', async () => {
    const result = await explainer.explainFailureDetailed(
      'mock-run',
      [{ domain: 'HTTP', type: 'HTTP_REQUEST', target: 'api.stripe.com' }],
      { name: 'no_500s' }
    );
    expect(result.isGrounded).toBe(true);
    expect(result.ungroundedReferences).toEqual([]);
    expect(result.hallucinationsRemoved).toBe(false);
  });

  it('reports grounding: flags hostnames missing from the events', async () => {
    const result = await explainer.explainFailureDetailed('mock-run', [{ type: 'HTTP_REQUEST' }], { name: 'no_500s' });
    expect(result.isGrounded).toBe(false);
    expect(result.ungroundedReferences).toContain('api.stripe.com');
  });
});

describe('findUngroundedReferences', () => {
  it('flags fault types, hostnames and event ids not present in the evidence', () => {
    const events = [{ id: 'evt-101', domain: 'DATABASE', payload: { host: 'db.internal.example' } }];
    const narrative = 'Event evt-101 shows a DB_CONNECTION_REFUSED on db.internal.example, then event evt-999 hit HTTP_TIMEOUT on api.stripe.com in handler.ts.';
    expect(findUngroundedReferences(narrative, events).sort())
      .toEqual(['DB_CONNECTION_REFUSED', 'HTTP_TIMEOUT', 'api.stripe.com', 'evt-999'].sort());
  });
});
