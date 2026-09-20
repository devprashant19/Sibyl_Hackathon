import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  CreateSessionRequest,
  Session,
  SessionListItem,
  RunListItem,
  RunDetail,
  PromiseTrend,
} from '@sibyl/shared';

export interface RunQuery {
  status?: string;
  project?: string;
  sessionId?: string;
  limit?: number;
}

export interface SessionStore {
  readonly kind: 'file' | 'memory';
  readonly location?: string;
  createSession(input: CreateSessionRequest, now?: number): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  listSessions(query?: { project?: string; limit?: number }): Promise<SessionListItem[]>;
  listRuns(query?: RunQuery): Promise<RunListItem[]>;
  getRun(runId: string): Promise<RunDetail | undefined>;
  promiseTrends(query?: { project?: string }): Promise<PromiseTrend[]>;
  counts(): { sessions: number; runs: number };
  /** Retention: removes sessions created before the cutoff. Satisfies core's RetentionStore. */
  deleteOlderThan(orgId: string, cutoffMs: number): Promise<{ deletedRuns: number; deletedEvents: number }>;
  countOlderThan(orgId: string, cutoffMs: number): Promise<{ deletedRuns: number; deletedEvents: number }>;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function withoutRuns(session: Session): SessionListItem {
  const { runs, sessionPromiseResults, ...rest } = session;
  return rest;
}

function countEvents(session: Session): number {
  return session.runs.reduce((n, r) => n + (r.events?.length ?? 0), 0);
}

/**
 * In-memory store. Every read returns copies, so a caller mutating a response cannot corrupt what
 * the next request sees.
 */
export class MemorySessionStore implements SessionStore {
  readonly kind: 'file' | 'memory' = 'memory';
  readonly location?: string;
  protected sessions = new Map<string, Session>();
  // runId -> sessionId. Run ids are seeded uuids, so the same run uploaded twice maps to one entry.
  protected runIndex = new Map<string, string>();

  async createSession(input: CreateSessionRequest, now = Date.now()): Promise<Session> {
    const id = input.id ?? crypto.randomUUID();
    if (this.sessions.has(id)) throw new ConflictError(`Session ${id} already exists.`);
    const session: Session = { ...structuredClone(input), id, createdAt: now };
    await this.persist(session);
    this.index(session);
    return structuredClone(session);
  }

  async getSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const copy = structuredClone(session);
    copy.runs = copy.runs.map(({ events, ...run }) => run);
    return copy;
  }

  async listSessions(query: { project?: string; limit?: number } = {}) {
    return this.sortedSessions()
      .filter(s => !query.project || s.project === query.project)
      .slice(0, clampLimit(query.limit))
      .map(s => structuredClone(withoutRuns(s)));
  }

  async listRuns(query: RunQuery = {}) {
    const limit = clampLimit(query.limit);
    const out: RunListItem[] = [];
    for (const session of this.sortedSessions()) {
      if (query.project && session.project !== query.project) continue;
      if (query.sessionId && session.id !== query.sessionId) continue;
      for (const run of session.runs) {
        if (query.status && run.status !== query.status) continue;
        const { events, ...rest } = run;
        out.push(structuredClone({
          ...rest,
          sessionId: session.id,
          project: session.project,
          createdAt: session.createdAt,
          failedPromises: run.promiseResults.filter(p => !p.passed).map(p => p.promiseId),
        }));
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async getRun(runId: string) {
    const sessionId = this.runIndex.get(runId);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    const run = session?.runs.find(r => r.runId === runId);
    if (!session || !run) return undefined;
    return structuredClone({
      ...run,
      sessionId: session.id,
      project: session.project,
      createdAt: session.createdAt,
      promises: session.promises,
    });
  }

  async promiseTrends(query: { project?: string } = {}) {
    const trends = new Map<string, PromiseTrend>();
    // Oldest first, so each trend's points read left to right in time.
    const sessions = this.sortedSessions().reverse().filter(s => !query.project || s.project === query.project);
    for (const session of sessions) {
      for (const promise of session.promises.filter(p => p.scope !== 'session')) {
        const results = session.runs.flatMap(r => r.promiseResults.filter(p => p.promiseId === promise.id));
        if (results.length === 0) continue;
        const failedRuns = results.filter(r => !r.passed).length;
        const trend = trends.get(promise.id) ?? {
          promiseId: promise.id, description: promise.description, severity: promise.severity, points: [],
        };
        trend.points.push({
          sessionId: session.id,
          completedAt: session.completedAt,
          runs: results.length,
          failedRuns,
          failRate: failedRuns / results.length,
        });
        trends.set(promise.id, trend);
      }
    }
    return [...trends.values()];
  }

  counts() {
    let runs = 0;
    for (const s of this.sessions.values()) runs += s.runs.length;
    return { sessions: this.sessions.size, runs };
  }

  async countOlderThan(_orgId: string, cutoffMs: number) {
    let deletedRuns = 0;
    let deletedEvents = 0;
    for (const s of this.sessions.values()) {
      if (s.createdAt < cutoffMs) {
        deletedRuns += s.runs.length;
        deletedEvents += countEvents(s);
      }
    }
    return { deletedRuns, deletedEvents };
  }

  async deleteOlderThan(orgId: string, cutoffMs: number) {
    const counts = await this.countOlderThan(orgId, cutoffMs);
    for (const s of [...this.sessions.values()]) {
      if (s.createdAt < cutoffMs) {
        await this.remove(s.id);
        for (const run of s.runs) {
          if (this.runIndex.get(run.runId) === s.id) this.runIndex.delete(run.runId);
        }
        this.sessions.delete(s.id);
      }
    }
    return counts;
  }

  protected index(session: Session) {
    this.sessions.set(session.id, session);
    for (const run of session.runs) this.runIndex.set(run.runId, session.id);
  }

  protected sortedSessions(): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  }

  protected async persist(_session: Session): Promise<void> {}
  protected async remove(_id: string): Promise<void> {}
}

/**
 * One JSON file per session under `dir`, loaded into memory at startup. Writes go to a temp file
 * and are renamed into place, so a crash mid-write never leaves a truncated session behind.
 * Plain files on purpose: `cat` is the debugger.
 */
export class FileSessionStore extends MemorySessionStore {
  readonly kind = 'file' as const;

  constructor(readonly location: string) {
    super();
    fs.mkdirSync(location, { recursive: true });
    for (const name of fs.readdirSync(location)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
      const file = path.join(location, name);
      try {
        const session = JSON.parse(fs.readFileSync(file, 'utf-8')) as Session;
        this.index(session);
      } catch (err: any) {
        // One unreadable file must not take the whole API down; say which one and move on.
        console.warn(`[api] Skipping unreadable session file ${file}: ${err.message}`);
      }
    }
  }

  private fileFor(id: string): string {
    // ids are validated as uuids before they get here; assert it anyway, since this builds a path.
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`Refusing to build a path from id ${JSON.stringify(id)}`);
    return path.join(this.location, `${id.toLowerCase()}.json`);
  }

  protected async persist(session: Session) {
    const file = this.fileFor(session.id);
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(session), 'utf-8');
    await fs.promises.rename(tmp, file);
  }

  protected async remove(id: string) {
    await fs.promises.rm(this.fileFor(id), { force: true });
  }
}
