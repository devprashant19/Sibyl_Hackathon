import { AsyncContext, type ProgrammaticPromise } from '@sibyl/core';
import type { FaultScheduleTemplate } from '@sibyl/shared';

let charges: string[] = [];

/**
 * THE BUG: a webhook handler that charges on every delivery. Webhook senders deliver at least
 * once: when the acknowledgement times out (an injected HTTP/TIMEOUT), the same event is sent
 * again, and the handler charges twice because it never records which event ids it processed.
 */
export async function handleWebhook(eventId: string, orderId: string) {
  charges.push(orderId);
  return { status: 200, eventId };
}

/** The sender side: deliver, and redeliver if the acknowledgement is lost. */
export async function deliverWebhook(eventId: string, orderId: string) {
  await handleWebhook(eventId, orderId);
  const fault = AsyncContext.getEngine()?.evaluateFaultDecision('HTTP', { route: '/webhooks/payment' });
  if (fault?.type === 'TIMEOUT') {
    await handleWebhook(eventId, orderId); // retry after the ack timed out
  }
}

export function resetDb() {
  charges = [];
}

export async function webhookWorkflow() {
  resetDb();
  await deliverWebhook('evt_123', 'order-123');
}

export const webhookTemplates: FaultScheduleTemplate[] = [
  {
    id: '6b1f0f1e-8c1a-4c8e-9d65-3c2d7b0a1a02',
    spec: { domain: 'HTTP', type: 'TIMEOUT' },
    probabilityRange: [0, 1],
    target: { route: '/webhooks/payment' },
  },
];

export const webhookPromise: ProgrammaticPromise = {
  id: 'bug-suite-webhook-idempotency',
  description: 'A redelivered webhook does not charge the order twice.',
  severity: 'CRITICAL',
  evaluate: () => {
    const count = charges.filter(o => o === 'order-123').length;
    return { passed: count <= 1, message: `order-123 was charged ${count} times.` };
  },
};
