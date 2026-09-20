import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AIDisabledError,
  ClaudeResponseError,
  DEFAULT_MODEL,
  SibylExplainer,
  SibylInvestigator,
  SibylPatcher,
  SibylPostmortemAnalyzer,
  extractText,
  isTruthyEnv,
  resolveModel,
} from '../src/index';
import { requireText } from '../src/common';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: vi.fn() };
    }
  };
});

describe('SIBYL_DISABLE_AI', () => {
  afterEach(() => {
    delete process.env.SIBYL_DISABLE_AI;
  });

  it.each(['true', 'TRUE', '1', 'yes', 'Yes', 'on', ' true '])('treats %j as disabled', (value) => {
    expect(isTruthyEnv(value)).toBe(true);
  });

  it.each([undefined, '', '0', 'false', 'no', 'off', 'disabled?'])('treats %j as enabled', (value) => {
    expect(isTruthyEnv(value)).toBe(false);
  });

  it('every agent throws AIDisabledError for truthy values', () => {
    process.env.SIBYL_DISABLE_AI = 'YES';
    const hooks = { fetchPromises: async () => [], fetchRecentEvents: async () => [] };
    expect(() => new SibylInvestigator({ apiKey: 'k', ...hooks })).toThrowError(AIDisabledError);
    expect(() => new SibylExplainer({ apiKey: 'k' })).toThrowError(AIDisabledError);
    expect(() => new SibylPatcher({ apiKey: 'k' })).toThrowError(AIDisabledError);
    expect(() => new SibylPostmortemAnalyzer({ apiKey: 'k' })).toThrowError(AIDisabledError);
  });

  it('agents construct normally when AI is not disabled', () => {
    process.env.SIBYL_DISABLE_AI = '0';
    expect(() => new SibylPatcher({ apiKey: 'k' })).not.toThrow();
  });
});

describe('text extraction', () => {
  it('concatenates all text blocks and skips non-text blocks', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Hello, ' },
      { type: 'tool_use', id: 't', name: 'x', input: {} },
      { type: 'text', text: 'world.' },
    ];
    expect(extractText(content)).toBe('Hello, world.');
  });

  it('requireText throws ClaudeResponseError when there is no text', () => {
    const response: any = { content: [{ type: 'thinking', thinking: '' }], stop_reason: 'max_tokens', usage: {} };
    expect(() => requireText(response)).toThrowError(ClaudeResponseError);
    expect(() => requireText(response)).toThrowError(/max_tokens/);
  });
});

describe('model resolution', () => {
  afterEach(() => {
    delete process.env.SIBYL_AGENT_MODEL;
  });

  it('prefers option, then SIBYL_AGENT_MODEL, then DEFAULT_MODEL', () => {
    expect(resolveModel()).toBe(DEFAULT_MODEL);
    process.env.SIBYL_AGENT_MODEL = 'claude-opus-5';
    expect(resolveModel()).toBe('claude-opus-5');
    expect(resolveModel('claude-haiku-4-5')).toBe('claude-haiku-4-5');
  });

  it('does not default to the retired Claude 3.5 Sonnet model', () => {
    expect(DEFAULT_MODEL).not.toMatch(/claude-3/);
  });
});
