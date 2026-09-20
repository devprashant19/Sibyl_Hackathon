import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  CreateSessionRequestSchema,
  ProgressEventSchema,
  RunStatusSchema,
  type ProgressEvent,
  type HealthResponse,
} from '@sibyl/shared';
import { ConflictError, SessionStore } from './store';

export interface AppOptions {
  store: SessionStore;
  version: string;
  /** When set, every write needs `Authorization: Bearer <token>`. Reads stay open. */
  token?: string;
  corsOrigin?: string;
  /** SSE keep-alive comment interval. */
  pingMs?: number;
  /** Called after a session is stored (webhooks hang off this). */
  onSessionCreated?: (sessionId: string) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public issues?: unknown) {
    super(message);
  }
}

function tokenMatches(expected: string, header: string | undefined): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(presented).digest();
  // Hash first so the comparison is constant-time regardless of the presented length.
  return crypto.timingSafeEqual(a, b) && presented.length > 0;
}

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createApp(options: AppOptions): { app: Express; bus: EventEmitter } {
  const { store } = options;
  const bus = new EventEmitter();
  bus.setMaxListeners(0); // one listener per open dashboard tab
  const startedAt = Date.now();
  const pingMs = options.pingMs ?? 15_000;

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: options.corsOrigin ?? '*' }));
  // A 10,000-run session with failing-run timelines is large; still bounded.
  app.use(express.json({ limit: '50mb' }));

  const requireWriteAuth = (req: Request, _res: Response, next: NextFunction) => {
    if (options.token && !tokenMatches(options.token, req.header('authorization'))) {
      return next(new HttpError(401, 'unauthorized', 'This API requires a bearer token for writes (SIBYL_API_TOKEN).'));
    }
    next();
  };

  const publish = (event: ProgressEvent) => bus.emit('progress', event);

  app.get('/api/health', (_req, res) => {
    const counts = store.counts();
    const body: HealthResponse = {
      status: 'ok',
      version: options.version,
      storage: { kind: store.kind, path: store.location },
      sessions: counts.sessions,
      runs: counts.runs,
      uptimeMs: Date.now() - startedAt,
      auth: { writesRequireToken: !!options.token },
    };
    res.json(body);
  });

  const v1 = express.Router();

  v1.post('/sessions', requireWriteAuth, async (req, res, next) => {
    try {
      const parsed = CreateSessionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, 'invalid_request', 'Session payload failed validation.', parsed.error.issues);
      }
      const session = await store.createSession(parsed.data);
      publish({
        type: 'completed',
        sessionId: session.id,
        project: session.project,
        done: session.summary.totalRuns,
        total: session.iterations,
        failures: session.summary.failures,
      });
      options.onSessionCreated?.(session.id);
      res.status(201).location(`/api/v1/sessions/${session.id}`).json({ data: { id: session.id } });
    } catch (err) {
      if (err instanceof ConflictError) return next(new HttpError(409, 'conflict', err.message));
      next(err);
    }
  });

  v1.get('/sessions', async (req, res, next) => {
    try {
      res.json({ data: await store.listSessions({ project: queryString(req.query.project), limit: parseLimit(req.query.limit) }) });
    } catch (err) {
      next(err);
    }
  });

  v1.get('/sessions/:id', async (req, res, next) => {
    try {
      if (!UUID.test(req.params.id)) throw new HttpError(404, 'not_found', 'No such session.');
      const session = await store.getSession(req.params.id);
      if (!session) throw new HttpError(404, 'not_found', 'No such session.');
      res.json({ data: session });
    } catch (err) {
      next(err);
    }
  });

  // The CLI posts progress while a session is still running; the dashboard listens.
  v1.post('/sessions/:id/progress', requireWriteAuth, (req, res, next) => {
    const parsed = ProgressEventSchema.safeParse({ ...req.body, sessionId: req.params.id });
    if (!parsed.success) {
      return next(new HttpError(400, 'invalid_request', 'Progress payload failed validation.', parsed.error.issues));
    }
    publish(parsed.data);
    res.status(202).json({ data: { accepted: true } });
  });

  const openStream = (req: Request, res: Response, filter: (e: ProgressEvent) => boolean) => {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // Send headers and a first byte now, so the client's `open` fires immediately rather than on
    // the first progress event (which may be minutes away).
    res.flushHeaders();
    res.write(': connected\n\n');

    const onProgress = (event: ProgressEvent) => {
      if (filter(event)) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const ping = setInterval(() => res.write(': ping\n\n'), pingMs);
    bus.on('progress', onProgress);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('progress', onProgress);
    });
  };

  v1.get('/sessions/:id/progress', (req, res) => openStream(req, res, e => e.sessionId === req.params.id));
  v1.get('/events', (req, res) => openStream(req, res, () => true));

  v1.get('/runs', async (req, res, next) => {
    try {
      const status = queryString(req.query.status);
      if (status && !RunStatusSchema.safeParse(status).success) {
        throw new HttpError(400, 'invalid_request', `Unknown status ${JSON.stringify(status)}. Expected one of ${RunStatusSchema.options.join(', ')}.`);
      }
      res.json({
        data: await store.listRuns({
          status,
          project: queryString(req.query.project),
          sessionId: queryString(req.query.sessionId),
          limit: parseLimit(req.query.limit),
        }),
      });
    } catch (err) {
      next(err);
    }
  });

  v1.get('/runs/:runId', async (req, res, next) => {
    try {
      const run = await store.getRun(req.params.runId);
      if (!run) throw new HttpError(404, 'not_found', 'No such run.');
      res.json({ data: run });
    } catch (err) {
      next(err);
    }
  });

  v1.get('/promises/trends', async (req, res, next) => {
    try {
      res.json({ data: await store.promiseTrends({ project: queryString(req.query.project) }) });
    } catch (err) {
      next(err);
    }
  });

  // ── Demo simulation endpoint ────────────────────────────────────────────────
  // POST /api/v1/demo/run
  // Runs a scripted fake simulation scenario, streaming SSE progress events to
  // any open dashboard tab, then saves the completed session so it shows up in
  // the Run Explorer immediately.
  v1.post('/demo/run', async (req, res) => {
    const scenarios = [
      {
        project: 'checkout',
        seed: `demo-${crypto.randomUUID().slice(0, 8)}`,
        strategy: 'ucb1' as const,
        promises: [
          { id: 'charge-at-most-once', description: 'A checkout never charges twice', severity: 'CRITICAL' as const, scope: 'run' as const },
          { id: 'inventory-consistent', description: 'Stock never goes negative', severity: 'HIGH' as const, scope: 'run' as const },
        ],
        faultType: 'HTTP/HTTP_5XX',
        totalRuns: 30,
        failRate: 0.18,
      },
      {
        project: 'notifications',
        seed: `demo-${crypto.randomUUID().slice(0, 8)}`,
        strategy: 'bayesian' as const,
        promises: [
          { id: 'push-within-sla', description: 'Push notifications arrive within 500ms SLA', severity: 'HIGH' as const, scope: 'run' as const },
          { id: 'no-duplicate-push', description: 'A push is never delivered twice', severity: 'MEDIUM' as const, scope: 'run' as const },
        ],
        faultType: 'HTTP/SLOW_RESPONSE',
        totalRuns: 50,
        failRate: 0.08,
      },
    ];
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    const sessionId = crypto.randomUUID();

    // Respond immediately with the session ID so the UI can open the SSE stream
    res.status(202).json({ data: { sessionId, project: scenario.project } });

    // Stream progress ticks asynchronously — don't await response
    void (async () => {
      const total = scenario.totalRuns;
      let failures = 0;

      for (let done = 1; done <= total; done++) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 150));
        const isFail = Math.random() < scenario.failRate;
        if (isFail) failures++;

        publish({
          type: 'progress',
          sessionId,
          project: scenario.project,
          done,
          total,
          failures,
        });
      }

      // Build and save the completed session
      const makeRun = (seed: string, status: 'COMPLETED' | 'FAILED' | 'INTERMITTENT', failedIds: string[] = []) => {
        const runId = `run-${crypto.randomUUID()}`;
        return {
          runId,
          seed,
          status,
          passed: status === 'COMPLETED',
          concreteSchedules: [{ id: crypto.randomUUID(), spec: { domain: 'HTTP' as const, type: 'SLOW_RESPONSE', delayMs: 1200 }, probability: 0.4 }],
          promiseResults: scenario.promises.map(p => ({
            promiseId: p.id,
            simulationRunId: runId,
            passed: !failedIds.includes(p.id),
            severity: p.severity,
            message: failedIds.includes(p.id) ? `Assertion violated under ${scenario.faultType}` : undefined,
            actualValue: failedIds.includes(p.id) ? 'unexpected_state' : undefined,
            evaluatedAt: Date.now(),
            intermittent: status === 'INTERMITTENT' && failedIds.includes(p.id),
          })),
          durationMs: 180 + Math.floor(Math.random() * 400),
          eventCount: failedIds.length > 0 ? 2 : 0,
          events: failedIds.length > 0 ? [
            { domain: 'HTTP' as const, id: crypto.randomUUID(), fault: 'SLOW_RESPONSE', timestamp: Date.now() - 300, payload: { method: 'POST', url: '/api/charge', statusCode: 504, durationMs: 1205 } },
            { domain: 'DATABASE' as const, id: crypto.randomUUID(), timestamp: Date.now() - 50, payload: { query: 'INSERT INTO charges', durationMs: 6 } },
          ] : undefined,
        };
      };

      const runs = [];
      let built = 0;
      for (let i = 0; i < total; i++) {
        const isFail = built / total < scenario.failRate && Math.random() < 0.5;
        const isInt = !isFail && Math.random() < 0.03;
        const status = isFail ? 'FAILED' : isInt ? 'INTERMITTENT' : 'COMPLETED';
        const failedIds = (isFail || isInt) ? [scenario.promises[0].id] : [];
        runs.push(makeRun(`${scenario.seed}-r${i}`, status, failedIds));
        if (isFail || isInt) built++;
      }

      try {
        await store.createSession({
          id: sessionId,
          project: scenario.project,
          seed: scenario.seed,
          strategy: scenario.strategy,
          iterations: total,
          startedAt: Date.now() - total * 250,
          completedAt: Date.now(),
          source: 'demo',
          promises: scenario.promises,
          summary: {
            totalRuns: total,
            failures: runs.filter(r => r.status === 'FAILED').length,
            passes: runs.filter(r => r.status === 'COMPLETED').length,
            errored: 0,
            intermittent: runs.filter(r => r.status === 'INTERMITTENT').length,
          },
          runs,
        });
      } catch { /* already exists */ }

      publish({
        type: 'completed',
        sessionId,
        project: scenario.project,
        done: total,
        total,
        failures,
      });
    })();
  });

  app.use('/api/v1', v1);


  app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'No such route.')));

  // Every error leaves as the same JSON shape. A malformed JSON body is the client's fault (400),
  // and nothing internal (stack, paths) is sent back.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, issues: err.issues } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body exceeds 50mb.' } });
    }
    console.error('[api] Unhandled error:', err);
    res.status(500).json({ error: { code: 'internal', message: 'Internal server error.' } });
  });

  return { app, bus };
}
