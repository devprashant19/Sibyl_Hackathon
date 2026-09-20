import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { SearchSessionJob, SimulationRunJob } from './job';

// Everything here is created on first use. These used to be module-level constants, so merely
// importing @sibyl/core opened a Redis connection to localhost:6379 — the CLI, the SDK and every
// test paid for it, and a machine without Redis logged ECONNREFUSED forever.

let connection: IORedis | undefined;
let searchQueue: Queue<SearchSessionJob> | undefined;
let simulationRunQueue: Queue<SimulationRunJob> | undefined;
let deadLetterQueue: Queue<SimulationRunJob> | undefined;

/** The shared Redis connection (REDIS_URL, default redis://localhost:6379). */
export function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }
  return connection;
}

/** High-level "run a search session" requests; a coordinator fans them out into run jobs. */
export function getSearchQueue(): Queue<SearchSessionJob> {
  return (searchQueue ??= new Queue<SearchSessionJob>('search-queue', { connection: getConnection() }));
}

/** Individual sandboxed simulation runs. */
export function getSimulationRunQueue(): Queue<SimulationRunJob> {
  return (simulationRunQueue ??= new Queue<SimulationRunJob>('simulation-run-queue', { connection: getConnection() }));
}

/** Jobs that failed all retries. */
export function getDeadLetterQueue(): Queue<SimulationRunJob> {
  return (deadLetterQueue ??= new Queue<SimulationRunJob>('simulation-dlq', { connection: getConnection() }));
}

/** Closes whatever was opened. Safe to call when nothing was. */
export async function closeQueues(): Promise<void> {
  await Promise.all([searchQueue?.close(), simulationRunQueue?.close(), deadLetterQueue?.close()]);
  if (connection) await connection.quit().catch(() => connection?.disconnect());
  connection = searchQueue = simulationRunQueue = deadLetterQueue = undefined;
}

/**
 * Dispatches a simulation run into the simulation-run queue.
 * The job id is the run id, so dispatching the same run twice enqueues it once.
 */
export async function dispatchSimulationRun(job: SimulationRunJob) {
  await getSimulationRunQueue().add(
    `sim-${job.runId}`,
    job,
    {
      jobId: job.runId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  );
}
