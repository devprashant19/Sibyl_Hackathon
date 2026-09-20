import { AsyncContext, type ProgrammaticPromise } from '@sibyl/core';
import type { FaultScheduleTemplate } from '@sibyl/shared';

let orders: { id: string; status: string }[] = [];
let inventory: { orderId: string; allocated: boolean }[] = [];

/**
 * THE BUG: two writes without a transaction. The order is inserted, then inventory is allocated.
 * If the second write fails (an injected DATABASE/CONNECTION_DROP), the error is swallowed but the
 * order is never rolled back, leaving an orphaned order.
 */
export async function processOrderTx(orderId: string) {
  orders.push({ id: orderId, status: 'CREATED' });

  try {
    const fault = AsyncContext.getEngine()?.evaluateFaultDecision('DATABASE', { query: 'INSERT INTO inventory' });
    if (fault?.type === 'CONNECTION_DROP') throw new Error('connection dropped');
    inventory.push({ orderId, allocated: true });
  } catch {
    // BUG: the order inserted above is not removed here.
  }
}

export function resetDb() {
  orders = [];
  inventory = [];
}

export async function rollbackWorkflow() {
  resetDb();
  await processOrderTx('order-abc');
}

export const rollbackTemplates: FaultScheduleTemplate[] = [
  {
    id: '6b1f0f1e-8c1a-4c8e-9d65-3c2d7b0a1a03',
    spec: { domain: 'DATABASE', type: 'CONNECTION_DROP' },
    probabilityRange: [0, 1],
    target: { query: 'INSERT INTO inventory' },
  },
];

export const rollbackPromise: ProgrammaticPromise = {
  id: 'bug-suite-partial-rollback',
  description: 'Every order has an inventory allocation.',
  severity: 'CRITICAL',
  evaluate: () => {
    const orphaned = orders.filter(o => !inventory.some(i => i.orderId === o.id));
    return { passed: orphaned.length === 0, message: `Orphaned orders: ${orphaned.map(o => o.id).join(', ') || 'none'}.` };
  },
};
