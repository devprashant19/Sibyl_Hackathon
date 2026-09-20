import { Worker, Job } from 'bullmq';
import { connection, SimulationRunJob, DockerSandboxProvider } from '@sibyl-core';
import IORedis from 'ioredis';

console.log('[Worker] Starting Sibyl Simulation Worker Daemon...');

const sandboxProvider = new DockerSandboxProvider();

// The worker listens to the simulation-run-queue.
// In BullMQ v5, workers can be configured to process groups in round-robin 
// to ensure fair-share scheduling across orgs.
const worker = new Worker<SimulationRunJob>(
  'simulation-run-queue',
  async (job: Job<SimulationRunJob>) => {
    const { runId, orgId, schedules, seed } = job.data;
    console.log(`[Worker] Processing Run ${runId} for Org ${orgId}`);

    // Create a Sandbox for isolation
    const sandbox = await sandboxProvider.createSandbox({
      imageId: 'sibyl-default-sandbox:latest',
      maxMemoryMb: 512,
      maxCpus: 1
    });

    try {
      // Execute the simulation within the sandbox
      // In reality, this would mount the target script and run it, capturing results via volume or network
      await sandbox.start(['node', 'dist/sandbox-worker.js']);
      
      // ... await sandbox execution completion ...
      // ... write results to Postgres database ...

      await job.updateProgress(100);
      console.log(`[Worker] Run ${runId} completed successfully.`);
    } catch (err) {
      console.error(`[Worker] Run ${runId} failed:`, err);
      throw err;
    } finally {
      await sandbox.stop();
      await sandbox.cleanup();
    }
  },
  {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    // group: {} - Native grouping configuration for fair-share scheduling
  }
);

worker.on('ready', () => {
  console.log('[Worker] Worker ready and listening for jobs!');
});

worker.on('error', (err) => {
  console.error('[Worker] Unexpected Error:', err);
});

// A Redis publisher for Webhook/WebSocket progress events
const pub = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

worker.on('completed', async (job) => {
  // Emit a global event so the API server can push SSE updates to clients
  await pub.publish('sibyl:progress', JSON.stringify({
    orgId: job.data.orgId,
    sessionId: job.data.sessionId,
    runId: job.data.runId,
    status: 'COMPLETED'
  }));
});
