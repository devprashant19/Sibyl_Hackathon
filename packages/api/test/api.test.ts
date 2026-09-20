import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Server } from 'http';
import type { CreateSessionRequest } from '@sibyl/shared';
import { createApp } from '../src/app';
import { FileSessionStore, MemorySessionStore, SessionStore } from '../src/store';

function sessionPayload(overrides: Partial<CreateSessionRequest> = {}): CreateSessionRequest {
  const failingRunId = crypto.randomUUID();
  return {
    project: 'checkout',
    seed: '0xBEEF',
    strategy: 'ucb1',
    iterations: 2,
    startedAt: 1_000,
    completedAt: 2_000,
    summary: { totalRuns: 2, failures: 1, passes: 1, errored: 0, intermittent: 0 },
    promises: [{ id: 'no-double-charge', description: 'never charge twice', severity: 'CRITICAL' }],
    source: 'cli',
    runs: [
      {
        runId: crypto.randomUUID(), seed: '0.1', status: 'COMPLETED', passed: true,
        concreteSchedules: [], eventCount: 3, durationMs: 5,
        promiseResults: [{ promiseId: 'no-double-charge', simulationRunId: 'x', passed: true, severity: 'CRITICAL', evaluatedAt: 1 }],
      },
      {
        runId: failingRunId, seed: '0.2', status: 'FAILED', passed: false, durationMs: 7, eventCount: 1,
        concreteSchedules: [{ id: crypto.randomUUID(), probability: 1, spec: { domain: 'HTTP', type: 'TIMEOUT', delayMs: 10 } }],
        promiseResults: [{ promiseId: 'no-double-charge', simulationRunId: failingRunId, passed: false, severity: 'CRITICAL', evaluatedAt: 2, message: 'charged twice' }],
        events: [{ domain: 'HTTP', id: 'HTTP-0', timestamp: 5, payload: { method: 'POST', url: '/charge', statusCode: 0, durationMs: 10 } }],
      },
    ],
    ...overrides,
  };
}

async function listen(store: SessionStore, token?: string) {
  const { app } = createApp({ store, version: 'test', token, pingMs: 50 });
  const server: Server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('Sibyl API', () => {
  let ctx: Awaited<ReturnType<typeof listen>>;
  let store: MemorySessionStore;

  beforeEach(async () => {
    store = new MemorySessionStore();
    ctx = await listen(store);
  });
  afterEach(async () => ctx.close());

  it('reports health', async () => {
    const res = await fetch(`${ctx.base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', storage: { kind: 'memory' }, sessions: 0, auth: { writesRequireToken: false } });
  });

  it('stores a session and serves it back through sessions, runs and run detail', async () => {
    const payload = sessionPayload();
    const created = await post(`${ctx.base}/api/v1/sessions`, payload);
    expect(created.status).toBe(201);
    const { data: { id } } = await created.json();

    const session = await (await fetch(`${ctx.base}/api/v1/sessions/${id}`)).json();
    expect(session.data.project).toBe('checkout');
    expect(session.data.runs[1].events).toBeUndefined(); // timelines only on run detail

    const failed = await (await fetch(`${ctx.base}/api/v1/runs?status=FAILED`)).json();
    expect(failed.data).toHaveLength(1);
    expect(failed.data[0]).toMatchObject({ sessionId: id, failedPromises: ['no-double-charge'] });

    const detail = await (await fetch(`${ctx.base}/api/v1/runs/${payload.runs[1].runId}`)).json();
    expect(detail.data.events).toHaveLength(1);
    expect(detail.data.promises[0].id).toBe('no-double-charge');
  });

  it('computes promise fail-rate trends across sessions, oldest first', async () => {
    const first = await post(`${ctx.base}/api/v1/sessions`, sessionPayload());
    expect(first.status).toBe(201);
    await new Promise(r => setTimeout(r, 5));
    const allPass = sessionPayload();
    allPass.runs[1].status = 'COMPLETED';
    allPass.runs[1].passed = true;
    allPass.runs[1].promiseResults[0].passed = true;
    await post(`${ctx.base}/api/v1/sessions`, allPass);

    const trends = await (await fetch(`${ctx.base}/api/v1/promises/trends`)).json();
    expect(trends.data[0].points.map((p: any) => p.failRate)).toEqual([0.5, 0]);
  });

  it('rejects invalid payloads with 400 and the validation issues', async () => {
    const res = await post(`${ctx.base}/api/v1/sessions`, { project: '' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(Array.isArray(body.error.issues)).toBe(true);
  });

  it('answers malformed JSON with 400, not 500', async () => {
    const res = await post(`${ctx.base}/api/v1/sessions`, '{"project": ');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_json');
  });

  it('returns 409 for a duplicate session id and 404 for unknown resources', async () => {
    const payload = sessionPayload({ id: crypto.randomUUID() });
    expect((await post(`${ctx.base}/api/v1/sessions`, payload)).status).toBe(201);
    expect((await post(`${ctx.base}/api/v1/sessions`, payload)).status).toBe(409);
    expect((await fetch(`${ctx.base}/api/v1/runs/nope`)).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/v1/sessions/../../etc/passwd`)).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/v1/runs?status=BOGUS`)).status).toBe(400);
  });

  it('streams progress events to SSE subscribers', async () => {
    const sessionId = crypto.randomUUID();
    const controller = new AbortController();
    const res = await fetch(`${ctx.base}/api/v1/sessions/${sessionId}/progress`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await post(`${ctx.base}/api/v1/sessions/${sessionId}/progress`, { type: 'progress', done: 3, total: 10, failures: 1 });

    let text = '';
    const deadline = Date.now() + 2000;
    while (!text.includes('"done":3') && Date.now() < deadline) {
      const { value } = await reader.read();
      text += decoder.decode(value);
    }
    controller.abort();
    expect(text).toContain(': connected');
    expect(text).toContain(`"sessionId":"${sessionId}"`);
  });
});

describe('write authentication', () => {
  it('requires the bearer token for writes but not reads', async () => {
    const ctx = await listen(new MemorySessionStore(), 's3cret');
    try {
      expect((await post(`${ctx.base}/api/v1/sessions`, sessionPayload())).status).toBe(401);
      expect((await post(`${ctx.base}/api/v1/sessions`, sessionPayload(), { authorization: 'Bearer wrong' })).status).toBe(401);
      expect((await post(`${ctx.base}/api/v1/sessions`, sessionPayload(), { authorization: 'Bearer s3cret' })).status).toBe(201);
      expect((await fetch(`${ctx.base}/api/v1/runs`)).status).toBe(200);
    } finally {
      await ctx.close();
    }
  });
});

describe('FileSessionStore', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-store-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('persists sessions across restarts and skips unreadable files', async () => {
    const payload = sessionPayload();
    const created = await new FileSessionStore(dir).createSession(payload);
    fs.writeFileSync(path.join(dir, `${crypto.randomUUID()}.json`), '{ truncated');

    const reopened = new FileSessionStore(dir);
    expect(reopened.counts()).toEqual({ sessions: 1, runs: 2 });
    expect((await reopened.getRun(payload.runs[1].runId))?.sessionId).toBe(created.id);
    expect(fs.readdirSync(dir).some(f => f.endsWith('.tmp'))).toBe(false);
  });

  it('deletes sessions past the retention cutoff, from memory and disk', async () => {
    const store = new FileSessionStore(dir);
    await store.createSession(sessionPayload(), 1_000);
    const recent = await store.createSession(sessionPayload(), 10_000);

    expect(await store.countOlderThan('default', 5_000)).toEqual({ deletedRuns: 2, deletedEvents: 1 });
    expect(await store.deleteOlderThan('default', 5_000)).toEqual({ deletedRuns: 2, deletedEvents: 1 });
    expect(store.counts().sessions).toBe(1);
    expect(fs.readdirSync(dir)).toEqual([`${recent.id}.json`]);
  });

  it('returns copies, so callers cannot mutate stored sessions', async () => {
    const store = new MemorySessionStore();
    const payload = sessionPayload();
    await store.createSession(payload);
    const run = await store.getRun(payload.runs[1].runId);
    run!.status = 'COMPLETED';
    expect((await store.getRun(payload.runs[1].runId))!.status).toBe('FAILED');
  });
});
