import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BudgetManager } from '../src/guardrails/BudgetManager';
import { CacheManager } from '../src/guardrails/CacheManager';
import { BudgetExceededError, ClaudeUnavailableError } from '../src/errors';
import { SibylExplainer } from '../src/explainer';

vi.mock('fs');
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        messages: {
          create: vi.fn().mockImplementation(async (args) => {
            if (args.messages[0].content.includes('trigger_timeout')) {
              throw new Error("Anthropic API Timeout");
            }
            return {
              content: [{ text: "Mock response" }],
              usage: { input_tokens: 100, output_tokens: 50 }
            };
          })
        }
      };
    })
  };
});

describe('Guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CacheManager should hash inputs and store/retrieve properly', () => {
    const cache = new CacheManager('/mock/dir');
    
    // Simulate fs behavior for CacheManager (we mocked fs, so we need to intercept writeFileSync/readFileSync if we want, or just test memory caching)
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    const key = cache.generateKey('investigate', 'my bug', 'project-1');
    const key2 = cache.generateKey('investigate', 'my bug', 'project-1');
    const keyDiff = cache.generateKey('investigate', 'other bug', 'project-1');

    expect(key).toEqual(key2);
    expect(key).not.toEqual(keyDiff);

    cache.set(key, 'cached_result');
    expect(cache.get(key)).toBe('cached_result');
  });

  it('BudgetManager should enforce limits and record spend', () => {
    const budget = new BudgetManager('/mock/budget.json');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    
    // Add $49.99 spend, limit is 50
    // cost = inputTokens/1000 * 0.003 + outputTokens/1000 * 0.015
    // let's just record a huge amount of tokens
    // 50.0 / 0.015 = 3333.3k output tokens
    budget.recordSpend('org-1', 0, 3333333); 
    
    // Org-1 is now around 50$
    budget.recordSpend('org-1', 0, 1000); // 1k output = 0.015
    
    expect(() => {
      budget.checkBudget('org-1');
    }).toThrowError(BudgetExceededError);

    // Unrelated org should pass
    expect(() => {
      budget.checkBudget('org-2');
    }).not.toThrowError();
  });

  it('SibylExplainer should throw ClaudeUnavailableError on network failure', async () => {
    const explainer = new SibylExplainer({ apiKey: 'fake-key', orgId: 'org-test-timeout' });
    
    // Clear budget
    vi.spyOn(BudgetManager.prototype, 'checkBudget').mockImplementation(() => {});

    await expect(explainer.explainFailure('run-1', [{ target: 'trigger_timeout' }], { promise: 'p1' }))
      .rejects.toThrowError(ClaudeUnavailableError);
  });
});
