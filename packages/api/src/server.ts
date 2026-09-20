import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { pathToFileURL } from 'url';
import { WebhookWorker } from '@sibyl/core';
import { DataRetentionWorker } from '@sibyl/core/retention';
import { createApp } from './app';
import { FileSessionStore, MemorySessionStore, SessionStore } from './store';
import { seedDemoData, shouldSeedDemo } from './demo-seed';

const VERSION = '0.1.0';
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string | null; // null = in-memory
  token?: string;
  corsOrigin?: string;
  retentionDays?: number;
  webhookUrl?: string;
  webhookSecret?: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const retention = env.SIBYL_RETENTION_DAYS ? Number(env.SIBYL_RETENTION_DAYS) : undefined;
  if (retention !== undefined && !(retention > 0)) {
    throw new Error(`SIBYL_RETENTION_DAYS must be a positive number, got ${JSON.stringify(env.SIBYL_RETENTION_DAYS)}`);
  }
  return {
    port: Number(env.PORT ?? 4000),
    host: env.SIBYL_API_HOST ?? '127.0.0.1',
    dataDir: env.SIBYL_DATA_DIR === ':memory:' ? null : (env.SIBYL_DATA_DIR ?? path.join(os.homedir(), '.sibyl', 'data', 'sessions')),
    token: env.SIBYL_API_TOKEN || undefined,
    corsOrigin: env.SIBYL_CORS_ORIGIN || undefined,
    retentionDays: retention,
    webhookUrl: env.SIBYL_WEBHOOK_URL || undefined,
    webhookSecret: env.SIBYL_WEBHOOK_SECRET || undefined,
  };
}

export async function startServer(config: ServerConfig = configFromEnv()) {
  const store: SessionStore = config.dataDir ? new FileSessionStore(config.dataDir) : new MemorySessionStore();

  // Seed demo data if the store is fresh (e.g. after a Render cold-start)
  const isDemoEnv = shouldSeedDemo(store, store.kind);
  if (isDemoEnv) {
    await seedDemoData(store);
    console.log('[api] Demo data seeded.');
  }

  let webhooks: WebhookWorker | undefined;
  if (config.webhookUrl) {
    if (!config.webhookSecret) throw new Error('SIBYL_WEBHOOK_URL is set but SIBYL_WEBHOOK_SECRET is not; deliveries must be signed.');
    webhooks = new WebhookWorker();
    webhooks.registerSubscription({ id: 'env', url: config.webhookUrl, secret: config.webhookSecret, eventTypes: ['*'] });
  }

  const { app, bus } = createApp({
    store,
    version: VERSION,
    token: config.token,
    corsOrigin: config.corsOrigin,
    onSessionCreated: async (sessionId) => {
      if (!webhooks) return;
      const session = await store.getSession(sessionId);
      if (!session) return;
      webhooks.dispatch({
        eventId: crypto.randomUUID(),
        eventType: session.summary.failures > 0 ? 'promise.failed' : 'session.completed',
        timestamp: new Date().toISOString(),
        data: { sessionId, project: session.project, seed: session.seed, summary: session.summary },
      });
    },
  });

  if (!LOOPBACK.has(config.host) && !config.token) {
    // Reads are always open; without a token, so are writes. Fine on a laptop, not on a network.
    console.warn(`[api] WARNING: listening on ${config.host} with no SIBYL_API_TOKEN — anyone who can reach this port can upload sessions.`);
  }

  let retentionTimer: ReturnType<typeof setInterval> | undefined;
  if (config.retentionDays) {
    const sweep = async () => {
      try {
        const r = await DataRetentionWorker.runSweep(store, 'default', 'PYTHIA', { retentionDays: config.retentionDays });
        if (r.deletedRuns > 0) console.log(`[api] Retention: deleted ${r.deletedRuns} runs and ${r.deletedEvents} events older than ${config.retentionDays} days.`);
      } catch (err: any) {
        console.error(`[api] Retention sweep failed: ${err.message}`);
      }
    };
    await sweep();
    retentionTimer = setInterval(sweep, 60 * 60 * 1000);
    retentionTimer.unref();
  }

  const server = await new Promise<import('http').Server>((resolve, reject) => {
    const s = app.listen(config.port, config.host, () => resolve(s));
    s.on('error', reject);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`[api] Sibyl API ${VERSION} on http://${config.host}:${port}  (storage: ${store.kind}${store.location ? ` ${store.location}` : ''}, ${store.counts().sessions} sessions)`);

  // Live SSE demo: every 30s emit a synthetic in-progress → completed event pair
  // so the Live Sessions panel shows activity even with no real CLI runs.
  if (store instanceof MemorySessionStore || isDemoEnv) {
    const runDemo = async () => {
      const demoSessionId = `demo-${crypto.randomUUID()}`;
      const projects = ['checkout', 'notifications'];
      const project = projects[Math.floor(Math.random() * projects.length)];
      const total = [50, 100, 200][Math.floor(Math.random() * 3)];
      // progress tick
      bus.emit('progress', {
        type: 'progress',
        sessionId: demoSessionId,
        project,
        done: Math.floor(total * 0.6),
        total,
        failures: Math.floor(Math.random() * 3),
      });
      // complete after 3s
      await new Promise(r => setTimeout(r, 3000));
      bus.emit('progress', {
        type: 'completed',
        sessionId: demoSessionId,
        project,
        done: total,
        total,
        failures: Math.floor(Math.random() * 3),
      });
    };
    // First one fires after 8s so the page has time to load
    setTimeout(() => {
      void runDemo();
      setInterval(() => void runDemo(), 30_000);
    }, 8000);
  }

  const close = async () => {
    if (retentionTimer) clearInterval(retentionTimer);
    // SSE streams never end on their own; drop them so close() can finish.
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  };

  return { server, port, store, close };
}

// Run directly (tsx src/server.ts), not when imported.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  startServer()
    .then(({ close }) => {
      const shutdown = (signal: string) => {
        console.log(`[api] ${signal} received, closing.`);
        close().then(() => process.exit(0));
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch(err => {
      console.error(`[api] Failed to start: ${err.message}`);
      process.exit(1);
    });
}
