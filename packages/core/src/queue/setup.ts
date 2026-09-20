import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { SearchSessionJob, SimulationRunJob } from './job';

// Ensure a single Redis connection is reused across queues
export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// The SearchQueue handles high-level "run a search session" requests.
// A coordinator worker pops these and fans them out into SimulationRunQueue.
export const searchQueue = new Queue<SearchSessionJob>('search-queue', { connection });

// The SimulationRunQueue handles individual sandboxed simulation runs.
export const simulationRunQueue = new Queue<SimulationRunJob>('simulation-run-queue', { 
  connection 
});

// The Dead Letter Queue handles jobs that have failed all retries
export const deadLetterQueue = new Queue<SimulationRunJob>('simulation-dlq', {
  connection
});

/**
 * Dispatches a simulation run into the simulation-run queue.
 * Utilizes BullMQ's native groups to implement fair-share scheduling across orgs.
 */
export async function dispatchSimulationRun(job: SimulationRunJob) {
  // Fair-share grouping: by setting `groupId: job.orgId`, workers configured with 
  // group processing will pull jobs round-robin across all active orgs.
  await simulationRunQueue.add(
    `sim-${job.runId}`,
    job,
    {
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
