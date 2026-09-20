import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { getConnection, getDeadLetterQueue, DockerSandboxProvider, SimulationRunJob } from '@sibyl/core/queue';
import { createRunHandler, createFailureHandler, JobLike } from './handler';

console.log('[Worker] Starting Sibyl Simulation Worker Daemon...');

const connection = getConnection();
// Pub/sub gets its own connection; BullMQ's connection issues blocking commands.
const pub = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

const deps = {
  redis: connection,
  sandboxProvider: new DockerSandboxProvider(),
  publish: (channel: string, message: string) => pub.publish(channel, message),
  deadLetter: (job: JobLike) => getDeadLetterQueue().add(`dlq-${job.id}`, job.data, { jobId: `dlq-${job.id}` }),
};
const handleRun = createRunHandler(deps);
const onFailed = createFailureHandler(deps);

const worker = new Worker<SimulationRunJob>('simulation-run-queue', job => handleRun(job), {
  connection,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
});

worker.on('ready', () => console.log('[Worker] Worker ready and listening for jobs!'));
worker.on('error', err => console.error('[Worker] Unexpected Error:', err));
worker.on('failed', (job: Job<SimulationRunJob> | undefined, err: Error) => {
  onFailed(job, err).catch(e => console.error('[Worker] DLQ move failed:', e));
});
worker.on('completed', async job => {
  // A global event so the API server can push SSE updates to clients
  await pub.publish('sibyl:progress', JSON.stringify({
    orgId: job.data.orgId,
    sessionId: job.data.sessionId,
    runId: job.data.runId,
    status: 'COMPLETED',
  }));
});

async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}. Starting graceful shutdown...`);
  await worker.close(); // stop taking jobs, let active ones finish
  await pub.quit().catch(() => {});
  await connection.quit().catch(() => {});
  console.log('[Worker] Graceful shutdown complete. Exiting process.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
