import { AsyncContext, type ProgrammaticPromise } from '@sibyl/core';
import type { FaultScheduleTemplate } from '@sibyl/shared';

// Mock database
let db = { counter: 0 };

/**
 * THE BUG: a read-modify-write without a lock. Normally the read and the write happen back to back.
 * When the read is slow (an injected DATABASE/SLOW_QUERY), another request can read the same value
 * in between, and one of the two increments is lost.
 */
export async function handleIncrementRequest() {
  const currentVal = db.counter;
  const fault = AsyncContext.getEngine()?.evaluateFaultDecision('DATABASE', { query: 'SELECT counter' });
  if (fault?.type === 'SLOW_QUERY') {
    await null; // the query result arrives later: other requests run first
  }
  db.counter = currentVal + 1;
}

export function resetDb() {
  db = { counter: 0 };
}

export const REQUESTS = 5;

export async function lostUpdateWorkflow() {
  resetDb();
  await Promise.all(Array.from({ length: REQUESTS }, () => handleIncrementRequest()));
}

export const lostUpdateTemplates: FaultScheduleTemplate[] = [
  {
    id: '6b1f0f1e-8c1a-4c8e-9d65-3c2d7b0a1a01',
    spec: { domain: 'DATABASE', type: 'SLOW_QUERY' },
    probabilityRange: [0, 1],
    target: { query: 'SELECT counter' },
  },
];

export const lostUpdatePromise: ProgrammaticPromise = {
  id: 'bug-suite-lost-update',
  description: `${REQUESTS} concurrent increments leave the counter at exactly ${REQUESTS}.`,
  severity: 'CRITICAL',
  evaluate: () => ({
    passed: db.counter === REQUESTS,
    message: `Expected ${REQUESTS}, got ${db.counter}.`,
  }),
};
