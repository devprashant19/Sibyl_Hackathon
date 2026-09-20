import { definePromise } from "@sibyl/sdk";

let db: Record<string, { status: string, balanceDeducted: boolean }> = {};

/**
 * THE BUG: A webhook handler that isn't robust against concurrent duplicate deliveries.
 * It checks if status === 'PROCESSED', but if two 'PENDING' events arrive at the same time,
 * they both pass the check and double-deduct the balance.
 */
export async function handleWebhook(orderId: string) {
  const order = db[orderId];
  
  if (order && order.status === 'PROCESSED') {
    return { status: 200, message: "Already processed" }; // Idempotent success
  }

  // Simulate network latency verifying the webhook signature
  await new Promise(r => setTimeout(r, 15));

  // The actual processing
  if (!order) {
    db[orderId] = { status: 'PROCESSED', balanceDeducted: true };
  } else {
    order.status = 'PROCESSED';
    // BUG: If it was PENDING, and two requests get past the initial check, they both hit this
    if (order.balanceDeducted) {
       // We'll throw an error to flag the double charge in our mock
       db[orderId] = { status: 'DOUBLE_CHARGED', balanceDeducted: true };
    } else {
      order.balanceDeducted = true;
    }
  }

  return { status: 200, message: "Processed successfully" };
}

export function resetDb() {
  db = { 'order-123': { status: 'PENDING', balanceDeducted: false } };
}

export const webhookPromise = definePromise({
  id: "bug-suite-webhook-idempotency",
  name: "Idempotent Webhooks",
  description: "Ensures that receiving duplicate webhooks for the same order does not double-charge.",
  evaluate: async () => {
    if (db['order-123']?.status === 'DOUBLE_CHARGED') {
      return { pass: false, message: `User was double charged due to concurrent webhook delivery.` };
    }
    return { pass: true, message: "Webhook processed exactly once." };
  }
});
