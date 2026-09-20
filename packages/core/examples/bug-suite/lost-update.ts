import { definePromise } from "@sibyl/sdk";

// Mock Database
let db = { counter: 0 };

/**
 * THE BUG: A classic Read-Modify-Write lost update.
 * If two requests hit this simultaneously, they might both read 
 * `db.counter = 0`, and both write `db.counter = 1`.
 */
export async function handleIncrementRequest() {
  // Simulate network read delay
  const currentVal = db.counter;
  await new Promise(r => setTimeout(r, 10)); 
  
  // Update
  db.counter = currentVal + 1;
}

export function resetDb() {
  db.counter = 0;
}

export const lostUpdatePromise = definePromise({
  id: "bug-suite-lost-update",
  name: "No Lost Updates",
  description: "Ensures that 5 concurrent increments exactly equal 5 in the DB.",
  evaluate: async () => {
    if (db.counter !== 5) {
      return { pass: false, message: `Expected 5, got ${db.counter}. Lost update race occurred.` };
    }
    return { pass: true, message: "No lost updates." };
  }
});
