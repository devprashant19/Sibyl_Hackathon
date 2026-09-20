import { AsyncContext, type ProgrammaticPromise } from '@sibyl/core';
import type { FaultScheduleTemplate } from '@sibyl/shared';

let db = { processedMessages: [] as string[] };
let mq = { queue: ['msg-1'], acked: [] as string[] };

/**
 * THE BUG: the worker writes to the database, then acknowledges the message. If it crashes in
 * between (an injected MESSAGE_QUEUE/CONSUMER_CRASH_MID_PROCESSING), the broker redelivers the
 * message, and the worker, which never checks whether it already processed that id, writes again.
 */
export async function processQueueWorker() {
  const msg = mq.queue[0];
  if (!msg) return;

  db.processedMessages.push(msg);

  const fault = AsyncContext.getEngine()?.evaluateFaultDecision('MESSAGE_QUEUE', { topic: 'orders', messageId: msg });
  if (fault?.type === 'CONSUMER_CRASH_MID_PROCESSING') {
    throw new Error('Worker crashed before ACK');
  }

  mq.acked.push(msg);
  mq.queue.shift();
}

export function resetDb() {
  db = { processedMessages: [] };
  mq = { queue: ['msg-1'], acked: [] };
}

/** The broker keeps delivering until the message is acknowledged (at most 3 deliveries here). */
export async function mqWorkflow() {
  resetDb();
  for (let delivery = 0; delivery < 3 && mq.queue.length > 0; delivery++) {
    try {
      await processQueueWorker();
    } catch {
      // the worker restarts; the unacknowledged message is redelivered
    }
  }
}

export const mqDuplicateTemplates: FaultScheduleTemplate[] = [
  {
    id: '6b1f0f1e-8c1a-4c8e-9d65-3c2d7b0a1a04',
    spec: { domain: 'MESSAGE_QUEUE', type: 'CONSUMER_CRASH_MID_PROCESSING' },
    probabilityRange: [0, 1],
    target: { topic: 'orders' },
  },
];

export const mqDuplicatePromise: ProgrammaticPromise = {
  id: 'bug-suite-mq-duplicate',
  description: 'A redelivered message is processed exactly once.',
  severity: 'CRITICAL',
  evaluate: () => {
    const count = db.processedMessages.filter(m => m === 'msg-1').length;
    return { passed: count === 1, message: `msg-1 was processed ${count} times.` };
  },
};
