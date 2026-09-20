import { describe, it, expect, vi } from 'vitest';
import {
  createRunHandler,
  createFailureHandler,
  RunLockedError,
  statusKey,
  LockClient,
  RELEASE_IF_OWNER,
} from '../src/handler';

/** Just enough Redis semantics for the lock: SET NX, GET, and the two owner-checked scripts. */
class FakeRedis implements LockClient {
  store = new Map<string, string>();
  async set(key: string, value: string) {
    if (this.store.has(key)) return null;
    this.store.set(key, value);
    return 'OK' as const;
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async eval(script: string, _numKeys: number, key: string, token: string, next?: string) {
    if (this.store.get(key) !== token) return 0;
    if (script === RELEASE_IF_OWNER) this.store.delete(key);
    else this.store.set(key, next!);
    return 1;
  }
}

const job = (attemptsMade = 1) => ({
  id: 'job-1',
  data: { runId: 'run-123', orgId: 'org-1', sessionId: 's-1', seed: '1', schedules: [] },
  opts: { attempts: 3 },
  attemptsMade,
  updateProgress: vi.fn(),
});

function setup(opts: { crash?: boolean; startDelayMs?: number; onStart?: () => void } = {}) {
  const redis = new FakeRedis();
  const starts = vi.fn();
  const cleanups = vi.fn();
  const deadLetter = vi.fn(async () => undefined);
  const publish = vi.fn(async () => 1);
  const deps = {
    redis,
    publish,
    deadLetter,
    log: { log: () => {}, error: () => {} },
    sandboxProvider: {
      async createSandbox() {
        return {
          id: 'sb',
          start: async () => {
            starts();
            opts.onStart?.();
            if (opts.startDelayMs) await new Promise(r => setTimeout(r, opts.startDelayMs));
            if (opts.crash) throw new Error('Sandbox crash');
          },
          stop: async () => {},
          cleanup: async () => { cleanups(); },
          executePressureFault: async () => {},
          executeCrashFault: async () => {},
        };
      },
    },
  };
  return { redis, starts, cleanups, deadLetter, publish, handler: createRunHandler(deps), onFailed: createFailureHandler(deps) };
}

describe('Worker job orchestration', () => {
  it('skips a run that is already completed', async () => {
    const { redis, starts, handler } = setup();
    redis.store.set(statusKey('run-123'), 'COMPLETED');
    await handler(job());
    expect(starts).not.toHaveBeenCalled();
  });

  it('marks a successful run COMPLETED, cleans up and meters it', async () => {
    const { redis, handler, publish, cleanups } = setup();
    await handler(job());
    expect(redis.store.get(statusKey('run-123'))).toBe('COMPLETED');
    expect(cleanups).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith('sibyl:usage', expect.stringContaining('"runId":"run-123"'));
  });

  it('refuses a duplicate delivery while another worker holds the lock (both used to run)', async () => {
    const { starts, handler } = setup({ startDelayMs: 20 });
    const results = await Promise.allSettled([handler(job()), handler(job())]);
    expect(starts).toHaveBeenCalledOnce();
    const locked = results.filter(r => r.status === 'rejected' && r.reason instanceof RunLockedError);
    expect(locked).toHaveLength(1);
  });

  it('releases its own lock on failure so a retry can run, and cleans up the sandbox', async () => {
    const { redis, handler, cleanups } = setup({ crash: true });
    await expect(handler(job())).rejects.toThrow('Sandbox crash');
    expect(redis.store.has(statusKey('run-123'))).toBe(false);
    expect(cleanups).toHaveBeenCalledOnce();
  });

  it('never deletes a lock another worker took over (a failing worker used to delete it)', async () => {
    const key = statusKey('run-123');
    const holder: { redis?: FakeRedis } = {};
    const ctx = setup({
      crash: true,
      // Simulate our lock expiring mid-run and another worker acquiring it.
      onStart: () => holder.redis!.store.set(key, 'PROCESSING:someone-else'),
    });
    holder.redis = ctx.redis;
    await expect(ctx.handler(job())).rejects.toThrow('Sandbox crash');
    expect(ctx.redis.store.get(key)).toBe('PROCESSING:someone-else');
  });

  it('moves a job to the dead letter queue only when retries are exhausted', async () => {
    const { onFailed, deadLetter } = setup();
    await onFailed(job(1), new Error('Sandbox crash'));
    expect(deadLetter).not.toHaveBeenCalled();
    await onFailed(job(3), new Error('Sandbox crash'));
    expect(deadLetter).toHaveBeenCalledOnce();
  });

  it('does not dead-letter a job that was only waiting on a lock', async () => {
    const { onFailed, deadLetter } = setup();
    await onFailed(job(3), new RunLockedError('run-123'));
    expect(deadLetter).not.toHaveBeenCalled();
  });
});
