import { describe, it, expect, vi } from 'vitest';
import { SibylPatcher, parsePatchOutput } from '../src/patcher';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockImplementation(async (args: any) => {
          if (args.messages[0].content.includes("CRLF_CASE")) {
            return {
              content: [
                { type: "thinking", thinking: "", signature: "sig" },
                { type: "text", text: "```diff\r\n--- a.ts\r\n" },
                { type: "text", text: "+++ a.ts\r\n-old\r\n+new\r\n```\r\n\r\nSwapped old for new." }
              ],
              stop_reason: "end_turn",
              usage: { input_tokens: 10, output_tokens: 10 }
            };
          }
          return {
            content: [{ type: "text",
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
    expect(result.truncated).toBe(false);
  });

  it('parses CRLF output split across multiple text blocks after a non-text block', async () => {
    const result = await patcher.suggestFix('CRLF_CASE', { 'a.ts': 'old' });
    expect(result.unifiedDiff).toBe('--- a.ts\n+++ a.ts\n-old\n+new');
    expect(result.explanation).toBe('Swapped old for new.');
  });

  it('parses a CRLF diff fence', () => {
    const result = parsePatchOutput('```diff\r\n-a\r\n+b\r\n```\r\nWhy.');
    expect(result.unifiedDiff).toBe('-a\n+b');
    expect(result.explanation).toBe('Why.');
    expect(result.truncated).toBe(false);
  });

  it('keeps a truncated diff with an unterminated fence', () => {
    const result = parsePatchOutput('```diff\n--- a.ts\n+++ a.ts\n-old\n+ne', true);
    expect(result.unifiedDiff).toBe('--- a.ts\n+++ a.ts\n-old\n+ne');
    expect(result.truncated).toBe(true);
  });

  it('reports no diff when there is no fence', () => {
    expect(parsePatchOutput('Sorry, no idea.').unifiedDiff).toBe('No diff generated.');
  });
});
