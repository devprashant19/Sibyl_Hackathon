import * as crypto from 'crypto';
import type { SessionStore } from './store';
import type { CreateSessionRequest } from '@sibyl/shared';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function daysAgo(n: number) {
  return now - n * DAY;
}

function uuid() {
  return crypto.randomUUID();
}

function makeRun(
  sessionId: string,
  seed: string,
  status: 'COMPLETED' | 'FAILED' | 'INTERMITTENT',
  promises: { id: string }[],
  failedIds: string[] = [],
  withEvents = false,
): NonNullable<CreateSessionRequest['runs']>[number] {
  const passed = status === 'COMPLETED';
  const intermittent = status === 'INTERMITTENT';
  const runId = `run-${uuid()}`;

  const promiseResults = promises.map((p) => ({
    promiseId: p.id,
    simulationRunId: runId,
    passed: passed || (!failedIds.includes(p.id) && !intermittent),
    severity: 'HIGH' as const,
    message: failedIds.includes(p.id) ? 'Assertion violated under chaos' : undefined,
    actualValue: failedIds.includes(p.id) ? 'unexpected_state' : undefined,
    evaluatedAt: now,
    intermittent: intermittent && failedIds.includes(p.id),
  }));

  const schedule = [
    {
      id: uuid(),
      spec: { domain: 'HTTP' as const, type: 'SLOW_RESPONSE', delayMs: 2000 },
      probability: 0.4,
    },
  ];

  const events = withEvents
    ? [
        {
          domain: 'HTTP' as const,
          id: uuid(),
          fault: 'SLOW_RESPONSE',
          timestamp: now - 200,
          payload: { method: 'POST', url: '/api/charge', statusCode: 504, durationMs: 2100 },
        },
        {
          domain: 'DATABASE' as const,
          id: uuid(),
          timestamp: now - 50,
          payload: { query: 'INSERT INTO charges', durationMs: 8 },
        },
      ]
    : undefined;

  return {
    runId,
    seed,
    status,
    passed: passed,
    concreteSchedules: schedule,
    promiseResults,
    durationMs: Math.floor(200 + Math.random() * 600),
    eventCount: events?.length ?? 0,
    events,
  };
}

/** Seed the store with realistic demo sessions if it is empty. */
export async function seedDemoData(store: MemorySessionStore): Promise<void> {
  // ── Project 1: checkout ──────────────────────────────────────────────────
  const checkoutPromises = [
    { id: 'no-double-charges', description: 'A customer is never charged twice', severity: 'CRITICAL' as const, scope: 'run' as const },
    { id: 'every-charge-has-receipt', description: 'Every successful charge emits a receipt event', severity: 'HIGH' as const, scope: 'run' as const },
  ];

  const checkoutSessions: CreateSessionRequest[] = [
    // 5 sessions spread over 30 days
    { project: 'checkout', seed: '0xA1B2', strategy: 'random', iterations: 50, startedAt: daysAgo(28), completedAt: daysAgo(28) + 90000, source: 'cli', promises: checkoutPromises, summary: { totalRuns: 50, failures: 6, passes: 42, errored: 0, intermittent: 2 }, runs: [
      makeRun('', '0xA1B2', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0xA1B3', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0xA1B4', 'INTERMITTENT', checkoutPromises, ['every-charge-has-receipt']),
      makeRun('', '0xA1B5', 'COMPLETED', checkoutPromises),
      makeRun('', '0xA1B6', 'COMPLETED', checkoutPromises),
    ] },
    { project: 'checkout', seed: '0xC3D4', strategy: 'random', iterations: 50, startedAt: daysAgo(21), completedAt: daysAgo(21) + 85000, source: 'ci', promises: checkoutPromises, summary: { totalRuns: 50, failures: 4, passes: 44, errored: 0, intermittent: 2 }, runs: [
      makeRun('', '0xC3D4', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0xC3D5', 'INTERMITTENT', checkoutPromises, ['no-double-charges']),
      makeRun('', '0xC3D6', 'COMPLETED', checkoutPromises),
      makeRun('', '0xC3D7', 'COMPLETED', checkoutPromises),
    ] },
    { project: 'checkout', seed: '0xE5F6', strategy: 'random', iterations: 100, startedAt: daysAgo(14), completedAt: daysAgo(14) + 180000, source: 'cli', promises: checkoutPromises, summary: { totalRuns: 100, failures: 8, passes: 88, errored: 1, intermittent: 3 }, runs: [
      makeRun('', '0xE5F6', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0xE5F7', 'FAILED', checkoutPromises, ['every-charge-has-receipt'], true),
      makeRun('', '0xE5F8', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0xE5F9', 'INTERMITTENT', checkoutPromises, ['no-double-charges']),
      makeRun('', '0xE5FA', 'COMPLETED', checkoutPromises),
      makeRun('', '0xE5FB', 'COMPLETED', checkoutPromises),
    ] },
    { project: 'checkout', seed: '0x7A8B', strategy: 'random', iterations: 50, startedAt: daysAgo(7), completedAt: daysAgo(7) + 92000, source: 'ci', promises: checkoutPromises, summary: { totalRuns: 50, failures: 3, passes: 46, errored: 0, intermittent: 1 }, runs: [
      makeRun('', '0x7A8B', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0x7A8C', 'INTERMITTENT', checkoutPromises, ['every-charge-has-receipt']),
      makeRun('', '0x7A8D', 'COMPLETED', checkoutPromises),
      makeRun('', '0x7A8E', 'COMPLETED', checkoutPromises),
      makeRun('', '0x7A8F', 'COMPLETED', checkoutPromises),
    ] },
    { project: 'checkout', seed: '0x8F2C', strategy: 'random', iterations: 400, startedAt: daysAgo(1), completedAt: daysAgo(1) + 600000, source: 'cli', promises: checkoutPromises, summary: { totalRuns: 400, failures: 12, passes: 382, errored: 0, intermittent: 6 }, runs: [
      makeRun('', '0x8F2C', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0x8F2D', 'FAILED', checkoutPromises, ['no-double-charges'], true),
      makeRun('', '0x8F2E', 'FAILED', checkoutPromises, ['every-charge-has-receipt'], true),
      makeRun('', '0x8F2F', 'INTERMITTENT', checkoutPromises, ['no-double-charges']),
      makeRun('', '0x8F30', 'INTERMITTENT', checkoutPromises, ['no-double-charges']),
      makeRun('', '0x8F31', 'COMPLETED', checkoutPromises),
      makeRun('', '0x8F32', 'COMPLETED', checkoutPromises),
      makeRun('', '0x8F33', 'COMPLETED', checkoutPromises),
    ] },
  ];

  // ── Project 2: notifications ─────────────────────────────────────────────
  const notifPromises = [
    { id: 'no-duplicate-push', description: 'A push notification is never delivered more than once', severity: 'HIGH' as const, scope: 'run' as const },
    { id: 'push-within-sla', description: 'Push notifications are delivered within 500ms SLA', severity: 'MEDIUM' as const, scope: 'run' as const },
  ];

  const notifSessions: CreateSessionRequest[] = [
    { project: 'notifications', seed: '0x1122', strategy: 'random', iterations: 50, startedAt: daysAgo(25), completedAt: daysAgo(25) + 70000, source: 'ci', promises: notifPromises, summary: { totalRuns: 50, failures: 2, passes: 47, errored: 0, intermittent: 1 }, runs: [
      makeRun('', '0x1122', 'FAILED', notifPromises, ['push-within-sla'], true),
      makeRun('', '0x1123', 'INTERMITTENT', notifPromises, ['push-within-sla']),
      makeRun('', '0x1124', 'COMPLETED', notifPromises),
      makeRun('', '0x1125', 'COMPLETED', notifPromises),
    ] },
    { project: 'notifications', startedAt: daysAgo(2), completedAt: daysAgo(2) + 12000, seed: 'notif-2', strategy: 'bayesian', iterations: 20, source: 'ci', promises: notifPromises, summary: { totalRuns: 20, failures: 0, passes: 20, errored: 0, intermittent: 0 }, runs: [
      makeRun('', '0x5555', 'COMPLETED', notifPromises),
      makeRun('', '0x5556', 'COMPLETED', notifPromises),
    ] },
    { project: 'notifications', startedAt: daysAgo(1), completedAt: daysAgo(1) + 11000, seed: 'notif-1', strategy: 'bayesian', iterations: 25, source: 'ci', promises: notifPromises, summary: { totalRuns: 25, failures: 1, passes: 24, errored: 0, intermittent: 0 }, runs: [
      makeRun('', '0x5566', 'FAILED', notifPromises, ['push-within-sla'], true),
      makeRun('', '0x5567', 'COMPLETED', notifPromises),
    ] },
    { project: 'notifications', startedAt: now - 2 * 60 * 60 * 1000, completedAt: now - 1.9 * 60 * 60 * 1000, seed: 'notif-0', strategy: 'bayesian', iterations: 15, source: 'cli', promises: notifPromises, summary: { totalRuns: 15, failures: 0, passes: 14, errored: 0, intermittent: 1 }, runs: [
      makeRun('', '0x5568', 'INTERMITTENT', notifPromises, ['push-within-sla']),
      makeRun('', '0x5569', 'COMPLETED', notifPromises),
      makeRun('', '0x556A', 'COMPLETED', notifPromises),
    ] },
  ];

  const allSessions = [...checkoutSessions, ...notifSessions];

  for (const session of allSessions) {
    try {
      await store.createSession(session, session.startedAt as number);
    } catch {
      // Skip if somehow already exists
    }
  }
}

/** Returns true if demo data should be seeded. */
export function shouldSeedDemo(store: { counts(): { sessions: number; runs: number } }, kind: 'file' | 'memory'): boolean {
  if (process.env.SIBYL_DEMO_MODE === 'false') return false;
  if (process.env.RENDER || process.env.SIBYL_DEMO_MODE === 'true') {
    return store.counts().sessions === 0;
  }
  if (kind === 'file') return false; // Never overwrite persisted real data
  return store.counts().sessions === 0;
}
