import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SibylInvestigator } from '../src/index';
import { CacheManager } from '../src/guardrails/CacheManager';
import { BudgetManager } from '../src/guardrails/BudgetManager';

vi.mock('../src/guardrails/CacheManager');
vi.mock('../src/guardrails/BudgetManager');
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockImplementation(async (args: any) => {
          const userMessage = args.messages.find((m: any) => m.role === 'user').content;
          
          if (userMessage.includes("it is vague and broken")) {
            return {
              content: [
                {
                  type: "tool_use",
                  id: "tool_1",
                  name: "submit_investigation",
                  input: {
                    reasoning: "The bug report is too vague. I don't know which service to target.",
                    clarifyingQuestion: "Which specific API endpoint or service failed for customer #4821?"
                  }
                }
              ],
              usage: { input_tokens: 10, output_tokens: 10 }
            };
          }

          if (userMessage.includes("new promise")) {
            return {
              content: [
                {
                  type: "tool_use",
                  id: "tool_2",
                  name: "submit_investigation",
                  input: {
                    reasoning: "None of the existing promises cover distributed locks, so I drafted a new one.",
                    faultSchedule: { faults: [{ type: "HTTP_TIMEOUT", target: "api.stripe.com", delayMs: 2000, probability: 1 }] },
                    draftNewPromiseCode: "definePromise({ name: 'distributed_lock_safe', check: () => true });"
                  }
                }
              ],
              usage: { input_tokens: 10, output_tokens: 10 }
            };
          }

          // Default: well-specified bug
          return {
            content: [
              {
                type: "tool_use",
                id: "tool_3",
                name: "submit_investigation",
                input: {
                  reasoning: "The telemetry shows calls to api.stripe.com, so I've injected HTTP timeouts there.",
                  faultSchedule: { faults: [{ type: "HTTP_TIMEOUT", target: "api.stripe.com", delayMs: 2000, probability: 1 }] },
                  existingPromiseName: "stripe_no_double_charge"
                }
              }
            ],
            usage: { input_tokens: 10, output_tokens: 10 }
          };
        })
      };
    }
  };
});

describe('SibylInvestigator', () => {
  const fetchPromisesMock = vi.fn().mockResolvedValue([{ name: 'stripe_no_double_charge' }]);
  const fetchRecentEventsMock = vi.fn().mockResolvedValue([{ type: 'HTTP_REQUEST', target: 'api.stripe.com' }]);

  beforeEach(() => {
    vi.clearAllMocks();
    (CacheManager as any).mockImplementation(() => ({
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      generateKey: vi.fn().mockReturnValue('mock-key')
    }));
    (BudgetManager as any).mockImplementation(() => ({
      checkBudget: vi.fn(),
      recordSpend: vi.fn()
    }));
  });

  it('should generate a concrete schedule for a well-specified bug', async () => {
    const agent = new SibylInvestigator({
      apiKey: 'mock-key',
      fetchPromises: fetchPromisesMock,
      fetchRecentEvents: fetchRecentEventsMock
    });
    const result = await agent.investigate('customer #4821 got charged but order failed', 'proj-1');
    expect(result.status).toBe('SUCCESS');
    expect(result.existingPromiseName).toBe('stripe_no_double_charge');
    expect(result.faultSchedule.faults[0].target).toBe('api.stripe.com');
  });

  it('should ask a clarifying question for a vague bug', async () => {
    const agent = new SibylInvestigator({
      apiKey: 'mock-key',
      fetchPromises: fetchPromisesMock,
      fetchRecentEvents: fetchRecentEventsMock
    });
    const result = await agent.investigate('it is vague and broken', 'proj-1');
    expect(result.status).toBe('NEEDS_CLARIFICATION');
    expect(result.clarifyingQuestion).toBeDefined();
  });

  it('should draft a new promise if required', async () => {
    const agent = new SibylInvestigator({
      apiKey: 'mock-key',
      fetchPromises: fetchPromisesMock,
      fetchRecentEvents: fetchRecentEventsMock
    });
    const result = await agent.investigate('new promise needed for distributed locks', 'proj-1');
    expect(result.status).toBe('SUCCESS');
    expect(result.draftNewPromiseCode).toBeDefined();
    expect(result.existingPromiseName).toBeUndefined();
  });
});
