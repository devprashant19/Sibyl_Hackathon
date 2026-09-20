import { describe, it, expect, vi } from 'vitest';
import { SibylPatcher } from '../src/patcher';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockImplementation(async (args: any) => {
          return {
            content: [{ 
              text: "```diff\n--- src/payment/handler.ts\n+++ src/payment/handler.ts\n@@ -10,3 +10,3 @@\n-  await processPayment();\n+  await processPayment({ idempotencyKey });\n```\n\nI added the idempotencyKey to the processPayment call to prevent double charges on retries." 
            }],
            usage: { input_tokens: 10, output_tokens: 10 }
          };
        })
      };
    }
  };
});

describe('SibylPatcher', () => {
  const patcher = new SibylPatcher({ apiKey: 'mock-key' });

  it('should generate a unified diff and explanation', async () => {
    const result = await patcher.suggestFix(
      'The HTTP timeout caused a retry, leading to a double charge because the idempotency key was missing.',
      { 'src/payment/handler.ts': 'await processPayment();' }
    );
    
    expect(result.unifiedDiff).toContain('+  await processPayment({ idempotencyKey });');
    expect(result.explanation).toContain('added the idempotencyKey');
  });
});
