import * as crypto from 'crypto';
import type { SimulationRunJob, SandboxProvider } from '@sibyl/core/queue';

/** The slice of a Redis client the handler needs — ioredis satisfies it. */
export interface LockClient {
  set(key: string, value: string, px: 'PX', ttlMs: number, nx: 'NX'): Promise<'OK' | null>;
  get(key: string): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

export interface JobLike {
  id?: string;
  data: SimulationRunJob;
  attemptsMade: number;
  opts: { attempts?: number };
  updateProgress(progress: number): Promise<void> | void;
}

export interface HandlerDeps {
  redis: LockClient;
  sandboxProvider: SandboxProvider;
  publish(channel: string, message: string): Promise<unknown>;
  deadLetter(job: JobLike): Promise<unknown>;
  /** Lock lifetime. A crashed worker's lock expires after this, so the run is not stuck forever. */
  lockTtlMs?: number;
  log?: Pick<Console, 'log' | 'error'>;
}

export class RunLockedError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} is being processed by another worker; retrying later.`);
    this.name = 'RunLockedError';
  }
}

export const statusKey = (runId: string) => `sibyl:run:${runId}:status`;
const COMPLETED = 'COMPLETED';

// Both scripts act only if the key still holds our token. GET-then-DEL from the client is not atomic.
export const RELEASE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
export const COMPLETE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('set', KEYS[1], ARGV[2]) else return 0 end`;

export function createRunHandler(deps: HandlerDeps) {
  const log = deps.log ?? console;
  const lockTtlMs = deps.lockTtlMs ?? 15 * 60_000;

  return async function handleRun(job: JobLike): Promise<void> {
    const { runId, orgId } = job.data;
    const key = statusKey(runId);
    const token = `PROCESSING:${crypto.randomUUID()}`;

    const acquired = await deps.redis.set(key, token, 'PX', lockTtlMs, 'NX');
    if (!acquired) {
      if ((await deps.redis.get(key)) === COMPLETED) {
        log.log(`[Worker] Run ${runId} is already completed. Skipping.`);
        await job.updateProgress(100);
        return;
      }
      // Another worker holds the lock. The old code proceeded anyway, so a duplicate delivery ran
      // the same run twice concurrently. Throw so BullMQ retries after the backoff instead.
      throw new RunLockedError(runId);
    }

    log.log(`[Worker] Processing Run ${runId} for Org ${orgId}`);
    const startTime = Date.now();
    const sandbox = await deps.sandboxProvider.createSandbox({
      imageId: 'sibyl-default-sandbox:latest',
      maxMemoryMb: 512,
      maxCpus: 1,
    });

    try {
      await sandbox.start(['node', 'dist/sandbox-worker.js']);
      await deps.redis.eval(COMPLETE_IF_OWNER, 1, key, token, COMPLETED);
      await job.updateProgress(100);
      log.log(`[Worker] Run ${runId} completed successfully.`);
    } catch (err) {
      log.error(`[Worker] Run ${runId} failed:`, err);
      // Release only our own lock, so a retry can start — never someone else's.
      await deps.redis.eval(RELEASE_IF_OWNER, 1, key, token);
      throw err;
    } finally {
      await sandbox.stop().catch(() => {});
      await sandbox.cleanup().catch(() => {});
      const sandboxMinutes = Math.ceil((Date.now() - startTime) / 60000);
      await deps.publish('sibyl:usage', JSON.stringify({
        orgId, runId, sandboxMinutes, timestamp: new Date().toISOString(),
      }));
    }
  };
}

/** BullMQ `failed` listener: a job whose retries are exhausted goes to the dead letter queue. */
export function createFailureHandler(deps: Pick<HandlerDeps, 'deadLetter' | 'log'>) {
  const log = deps.log ?? console;
  return async function onFailed(job: JobLike | undefined, err: Error) {
    if (!job) return;
    log.error(`[Worker] Job ${job.id} failed with error: ${err.message}. Attempts made: ${job.attemptsMade}`);
    if (err instanceof RunLockedError) return; // waiting on another worker is not a failure of the run
    if (job.opts.attempts && job.attemptsMade >= job.opts.attempts) {
      log.log(`[Worker] Job ${job.id} exhausted retries. Moving to DLQ.`);
      await deps.deadLetter(job);
    }
  };
}
