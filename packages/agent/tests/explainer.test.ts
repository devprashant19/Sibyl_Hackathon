import { describe, it, expect, vi } from 'vitest';
import { SibylExplainer } from '../src/explainer';

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
                content: [{ text: "Alert triggered: Promise failed. The HTTP timeout broke the idempotency. (Removed ungrounded DB crash claim)." }],
                usage: { input_tokens: 10, output_tokens: 10 }
              };
            }
            // Identity return for clean narrative
            const narrativeMatch = userMessage.match(/Narrative:\n([\s\S]*?)\n\nRaw Telemetry:/);
            const narrative = narrativeMatch ? narrativeMatch[1] : "Validated narrative";
            return {
              content: [{ text: narrative }],
              usage: { input_tokens: 10, output_tokens: 10 }
            };
          }

          // Phase 1: Drafting
          if (userMessage.includes("hallucinate")) {
            return {
              content: [{ text: "Alert triggered: Promise failed. The HTTP timeout broke the idempotency. Also a hallucinated DB crash happened." }],
              usage: { input_tokens: 10, output_tokens: 10 }
            };
          }

          return {
            content: [{ text: "Alert triggered: Promise no_500s failed. The HTTP timeout to api.stripe.com caused the handler to throw an uncaught error." }],
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
});
