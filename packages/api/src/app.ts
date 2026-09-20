import express, { NextFunction, Request, Response } from 'express';
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

export function createApp(options: AppOptions) {
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
