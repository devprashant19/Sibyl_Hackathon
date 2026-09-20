import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SibylInvestigator, AgentTurnLimitError, RECENT_EVENTS_MAX_LIMIT, clampRecentEventsLimit } from '../src/index';

const createMock = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    }
  };
});

const usage = { input_tokens: 10, output_tokens: 10 };

function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input };
}

describe('SibylInvestigator tool loop', () => {
  const fetchPromises = vi.fn().mockResolvedValue([{ name: 'no_500s' }]);
  const fetchRecentEvents = vi.fn().mockResolvedValue([{ domain: 'HTTP', target: 'api.stripe.com' }]);

  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockReset();
  });

  function makeAgent(extra: Record<string, unknown> = {}) {
    return new SibylInvestigator({ apiKey: 'mock-key', fetchPromises, fetchRecentEvents, ...extra });
  }

  it('returns an is_error tool_result for unknown tool names and keeps going', async () => {
    let seenMessages: any[] = [];
    createMock
      .mockImplementationOnce(async () => ({
        content: [toolUse('t1', 'delete_production', {}), toolUse('t2', 'get_promises', { projectId: 'p' })],
        stop_reason: 'tool_use',
        usage
      }))
      .mockImplementationOnce(async (args: any) => {
        // Snapshot: the agent keeps appending to the same messages array after this call.
        seenMessages = structuredClone(args.messages);
        return {
          content: [toolUse('t3', 'submit_investigation', { reasoning: 'done', faultSchedule: { faults: [{ type: 'HTTP_TIMEOUT' }] } })],
          stop_reason: 'tool_use',
          usage
        };
      });

    const result = await makeAgent().investigate('unknown tool bug', 'proj-1');
    expect(result.status).toBe('SUCCESS');
    expect(createMock).toHaveBeenCalledTimes(2);

    const lastMessage = seenMessages[seenMessages.length - 1];
    expect(lastMessage.role).toBe('user');
    // Both tool_use blocks answered, in one user message.
    expect(lastMessage.content).toHaveLength(2);
    const unknownResult = lastMessage.content.find((b: any) => b.tool_use_id === 't1');
    expect(unknownResult).toMatchObject({ type: 'tool_result', is_error: true });
    expect(unknownResult.content).toContain('delete_production');
    const knownResult = lastMessage.content.find((b: any) => b.tool_use_id === 't2');
    expect(knownResult.is_error).toBeUndefined();
  });

  it('stops after maxTurns with AgentTurnLimitError', async () => {
    createMock.mockImplementation(async () => ({
      content: [toolUse('t', 'get_promises', { projectId: 'p' })],
      stop_reason: 'tool_use',
      usage
    }));

    await expect(makeAgent({ maxTurns: 3 }).investigate('looping bug', 'proj-1'))
      .rejects.toThrowError(AgentTurnLimitError);
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('defaults to 8 turns', async () => {
    createMock.mockImplementation(async () => ({
      content: [toolUse('t', 'get_promises', { projectId: 'p' })],
      stop_reason: 'tool_use',
      usage
    }));

    await expect(makeAgent().investigate('looping bug default', 'proj-1'))
      .rejects.toThrowError(AgentTurnLimitError);
    expect(createMock).toHaveBeenCalledTimes(8);
  });

  it('clamps the model-supplied get_recent_events limit', async () => {
    createMock
      .mockImplementationOnce(async () => ({
        content: [toolUse('t1', 'get_recent_events', { projectId: 'p', limit: 1e9 })],
        stop_reason: 'tool_use',
        usage
      }))
      .mockImplementationOnce(async () => ({
        content: [toolUse('t2', 'get_recent_events', { projectId: 'p', limit: -5 })],
        stop_reason: 'tool_use',
        usage
      }))
      .mockImplementationOnce(async () => ({
        content: [toolUse('t3', 'submit_investigation', { reasoning: 'ok', clarifyingQuestion: 'which?' })],
        stop_reason: 'tool_use',
        usage
      }));

    await makeAgent().investigate('clamp bug', 'proj-1');
    expect(fetchRecentEvents).toHaveBeenNthCalledWith(1, 'proj-1', RECENT_EVENTS_MAX_LIMIT);
    expect(fetchRecentEvents).toHaveBeenNthCalledWith(2, 'proj-1', 1);
    expect(clampRecentEventsLimit('abc')).toBe(100);
    expect(clampRecentEventsLimit(42.7)).toBe(42);
  });
});
