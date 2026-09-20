import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BudgetManager, computeCost } from '../src/guardrails/BudgetManager';
import { CacheManager } from '../src/guardrails/CacheManager';
import { BudgetExceededError, BudgetStoreCorruptError, ClaudeUnavailableError } from '../src/errors';
import { SibylExplainer } from '../src/explainer';
import { DEFAULT_MODEL, FALLBACK_MODEL_PRICE, getModelPrice } from '../src/models';

const createMock = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        messages: {
          create: createMock
        }
      };
    })
  };
});

const ctx = { agent: 'investigate', model: DEFAULT_MODEL, orgId: 'org-1' };

describe('Guardrails', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-guardrails-'));
    createMock.mockImplementation(async (args: any) => {
      if (args.messages[0].content.includes('trigger_timeout')) {
        throw new Error("Anthropic API Timeout");
      }
      return {
        content: [{ type: "text", text: "Mock response" }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('CacheManager', () => {
    it('should hash inputs and store/retrieve properly', () => {
      const cache = new CacheManager(tmpDir);

      const key = cache.generateKey(ctx, 'my bug', 'project-1');
      const key2 = cache.generateKey(ctx, 'my bug', 'project-1');
      const keyDiff = cache.generateKey(ctx, 'other bug', 'project-1');

      expect(key).toEqual(key2);
      expect(key).not.toEqual(keyDiff);

      cache.set(key, 'cached_result');
      expect(cache.get(key)).toBe('cached_result');
      // A fresh instance reads it back from disk.
      expect(new CacheManager(tmpDir).get(key)).toBe('cached_result');
    });

    it('separates keys by org, model, agent and input boundaries', () => {
      const cache = new CacheManager(tmpDir);
      const base = cache.generateKey(ctx, 'ab', 'c');

      expect(cache.generateKey({ ...ctx, orgId: 'org-2' }, 'ab', 'c')).not.toEqual(base);
      expect(cache.generateKey({ ...ctx, model: 'claude-opus-5' }, 'ab', 'c')).not.toEqual(base);
      expect(cache.generateKey({ ...ctx, agent: 'explain' }, 'ab', 'c')).not.toEqual(base);
      expect(cache.generateKey(ctx, 'a', 'bc')).not.toEqual(base);
      expect(cache.generateKey(ctx, 'abc')).not.toEqual(base);
      expect(cache.generateKey(ctx, '1')).not.toEqual(cache.generateKey(ctx, 1));
    });

    it('handles undefined inputs without throwing and keeps them distinct from null', () => {
      const cache = new CacheManager(tmpDir);
      expect(() => cache.generateKey(ctx, undefined)).not.toThrow();
      expect(cache.generateKey(ctx, undefined)).not.toEqual(cache.generateKey(ctx, null));
      expect(cache.generateKey(ctx, undefined)).not.toEqual(cache.generateKey(ctx, 'null'));
      expect(cache.generateKey(ctx, { a: 1, b: 2 })).toEqual(cache.generateKey(ctx, { b: 2, a: 1 }));
    });

    it('treats corrupt or foreign cache entries as a miss', () => {
      const cache = new CacheManager(tmpDir);
      const key = cache.generateKey(ctx, 'bug');
      const file = path.join(tmpDir, `${key}.json`);

      fs.writeFileSync(file, '{not json');
      expect(cache.get(key)).toBeNull();

      fs.writeFileSync(file, JSON.stringify({ v: 1, key: 'someone-else', value: 'x' }));
      expect(new CacheManager(tmpDir).get(key)).toBeNull();

      // Legacy format (raw value, no envelope) is also a miss.
      fs.writeFileSync(file, '"stale answer"');
      expect(new CacheManager(tmpDir).get(key)).toBeNull();

      expect(cache.get('../../etc/passwd')).toBeNull();
    });

    it('uses SIBYL_AGENT_CACHE_DIR when no directory is passed', () => {
      const previous = process.env.SIBYL_AGENT_CACHE_DIR;
      process.env.SIBYL_AGENT_CACHE_DIR = tmpDir;
      try {
        const cache = new CacheManager();
        const key = cache.generateKey(ctx, 'env');
        cache.set(key, 'v');
        expect(fs.existsSync(path.join(tmpDir, `${key}.json`))).toBe(true);
      } finally {
        process.env.SIBYL_AGENT_CACHE_DIR = previous;
      }
    });
  });

  describe('BudgetManager', () => {
    it('should enforce limits and record spend', () => {
      const budget = new BudgetManager(path.join(tmpDir, 'budget.json'));
      const price = getModelPrice(DEFAULT_MODEL);

      // Spend exactly the $50 default limit in output tokens, plus a little more.
      const tokensForLimit = Math.ceil((50.0 / price.outputPerMTok) * 1_000_000);
      budget.recordSpend('org-1', 0, tokensForLimit, DEFAULT_MODEL);
      budget.recordSpend('org-1', 0, 1000, DEFAULT_MODEL);

      expect(() => {
        budget.checkBudget('org-1');
      }).toThrowError(BudgetExceededError);

      // Unrelated org should pass
      expect(() => {
        budget.checkBudget('org-2');
      }).not.toThrowError();
    });

    it('persists spend across two instances sharing a file', () => {
      const file = path.join(tmpDir, 'nested', 'budget.json');
      const a = new BudgetManager(file);
      const b = new BudgetManager(file);

      a.recordSpend('org-1', 1_000_000, 0, DEFAULT_MODEL);
      b.recordSpend('org-1', 1_000_000, 0, DEFAULT_MODEL);
      a.recordSpend('org-1', 0, 1_000_000, DEFAULT_MODEL);

      const expected = computeCost(DEFAULT_MODEL, 2_000_000, 1_000_000);
      expect(a.getBudget('org-1').currentSpend).toBeCloseTo(expected, 10);
      expect(new BudgetManager(file).getBudget('org-1').currentSpend).toBeCloseTo(expected, 10);
      expect(fs.readdirSync(path.dirname(file)).filter(f => f.endsWith('.tmp'))).toEqual([]);
    });

    it('fails closed on a corrupt budget file and does not reset spend', () => {
      const file = path.join(tmpDir, 'budget.json');
      fs.writeFileSync(file, '{"org-1": {"limit": 50, "currentSpend": 49.9');
      const budget = new BudgetManager(file);

      expect(() => budget.checkBudget('org-1')).toThrowError(BudgetStoreCorruptError);
      expect(() => budget.recordSpend('org-1', 10, 10, DEFAULT_MODEL)).toThrowError(BudgetStoreCorruptError);
      expect(fs.readFileSync(file, 'utf-8')).toBe('{"org-1": {"limit": 50, "currentSpend": 49.9');

      fs.writeFileSync(file, JSON.stringify({ 'org-1': { limit: 50, currentSpend: 'lots' } }));
      expect(() => budget.checkBudget('org-1')).toThrowError(BudgetStoreCorruptError);
    });

    it('blocks a call whose worst-case cost would overshoot the remaining budget', () => {
      const file = path.join(tmpDir, 'budget.json');
      fs.writeFileSync(file, JSON.stringify({ 'org-1': { limit: 1, currentSpend: 0.99 } }));
      const budget = new BudgetManager(file);

      // Under the limit without an estimate...
      expect(() => budget.checkBudget('org-1')).not.toThrow();
      // ...but 4096 output tokens at the default model's price would cross $1.
      expect(() => budget.checkBudget('org-1', { model: DEFAULT_MODEL, maxOutputTokens: 4096 }))
        .toThrowError(BudgetExceededError);
      // A small call still fits.
      expect(() => budget.checkBudget('org-1', { model: DEFAULT_MODEL, maxOutputTokens: 100, inputChars: 100 }))
        .not.toThrow();
    });

    it('prices unknown models at the most expensive known rate and dated snapshots at their alias', () => {
      expect(getModelPrice('some-future-model')).toEqual(FALLBACK_MODEL_PRICE);
      expect(getModelPrice('claude-haiku-4-5-20251001')).toEqual(getModelPrice('claude-haiku-4-5'));
      expect(computeCost('some-future-model', 0, 1_000_000)).toBe(FALLBACK_MODEL_PRICE.outputPerMTok);
    });
  });

  it('SibylExplainer should throw ClaudeUnavailableError on network failure', async () => {
    const explainer = new SibylExplainer({ apiKey: 'fake-key', orgId: 'org-test-timeout' });

    // Clear budget
    const spy = vi.spyOn(BudgetManager.prototype, 'checkBudget').mockImplementation(() => {});

    try {
      await expect(explainer.explainFailure('run-1', [{ target: 'trigger_timeout' }], { promise: 'p1' }))
        .rejects.toThrowError(ClaudeUnavailableError);
    } finally {
      spy.mockRestore();
    }
  });

  it('SibylExplainer blocks the call before sending when the estimate exceeds the budget', async () => {
    const file = path.join(tmpDir, 'budget.json');
    fs.writeFileSync(file, JSON.stringify({ 'org-tight': { limit: 0.01, currentSpend: 0 } }));
    const explainer = new SibylExplainer({ apiKey: 'fake-key', orgId: 'org-tight', budgetFile: file, cacheDir: tmpDir });

    await expect(explainer.explainFailure('run-1', [], {})).rejects.toThrowError(BudgetExceededError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('ClaudeUnavailableError carries the underlying status and message', () => {
    const err = new ClaudeUnavailableError(Object.assign(new Error('model: not_found'), { status: 404 }));
    expect(err.status).toBe(404);
    expect(err.message).toContain('HTTP 404');
    expect(err.message).toContain('model: not_found');
  });
});
