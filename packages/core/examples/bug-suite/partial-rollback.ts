import { definePromise } from "@sibyl/sdk";

let orders: any[] = [];
let inventory: any[] = [];

/**
 * THE BUG: A partial failure without a distributed rollback.
 * We insert into orders, then attempt to insert into inventory.
 * If the inventory insert fails (e.g., constraint error, or injected DB crash),
 * the order is left orphaned because we don't rollback the order array.
 */
export async function processOrderTx(orderId: string, simulateFailure = false) {
  // Step 1: Insert Order
  orders.push({ id: orderId, status: 'CREATED' });

  // Simulate network delay between queries
  await new Promise(r => setTimeout(r, 5));

  // Step 2: Insert Inventory Allocation
  if (simulateFailure) {
    // We catch the error to prevent app crash, but FORGET to rollback orders!
    console.error("Failed to allocate inventory");
    return;
  }

  inventory.push({ orderId, allocated: true });
}

export function resetDb() {
  orders = [];
  inventory = [];
}

export const rollbackPromise = definePromise({
  id: "bug-suite-partial-rollback",
  name: "Atomic Transactions",
  description: "Ensures no orphaned orders exist without inventory allocation.",
  evaluate: async () => {
    if (orders.length > 0 && inventory.length === 0) {
      return { pass: false, message: `Orphaned record detected. Orders: ${orders.length}, Inventory: ${inventory.length}.` };
    }
    return { pass: true, message: "Atomic consistency maintained." };
  }
});
