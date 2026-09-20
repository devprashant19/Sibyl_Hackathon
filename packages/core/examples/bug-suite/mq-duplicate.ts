import { definePromise } from "@sibyl/sdk";

let db = { processedMessages: [] as string[] };
let mq = { queue: ['msg-1'], acked: [] as string[] };

/**
 * THE BUG: Worker processes an MQ message, updates the DB, but if it crashes
 * BEFORE acking the message, the MQ system will redeliver it later.
 * Because the handler doesn't check if it already processed msgId, it inserts a duplicate.
 */
export async function processQueueWorker(simulateCrashAfterDB = false) {
  const msg = mq.queue[0];
  if (!msg) return;

  // Process and save to DB
  db.processedMessages.push(msg);

  // BUG CAUSE: Crash before ACK
  if (simulateCrashAfterDB) {
    throw new Error("Worker crashed before ACK");
  }

  // ACK
  mq.acked.push(msg);
  mq.queue.shift();
}

export function resetDb() {
  db = { processedMessages: [] };
  mq = { queue: ['msg-1'], acked: [] };
}

export const mqDuplicatePromise = definePromise({
  id: "bug-suite-mq-duplicate",
  name: "Idempotent MQ Worker",
  description: "Ensures the database remains consistent even if a message is delivered twice (At-Least-Once delivery).",
  evaluate: async () => {
    const counts = db.processedMessages.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (counts['msg-1'] > 1) {
      return { pass: false, message: `Message msg-1 was processed ${counts['msg-1']} times. Missing idempotency key check.` };
    }
    return { pass: true, message: "Message processed exactly once." };
  }
});
