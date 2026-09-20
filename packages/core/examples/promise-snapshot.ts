import { pathToFileURL } from 'url';
import { SearchOrchestrator, snapshotPromise } from '@sibyl/core';

/**
 * A snapshot promise: the final state of a workflow must match a stored "golden" file.
 *
 *   cd packages/core && npx tsx examples/promise-snapshot.ts --update-snapshots   # write the golden file
 *   cd packages/core && npx tsx examples/promise-snapshot.ts                      # compare against it
 *
 * The golden file is written to __snapshots__/final_invoice_state.snap.json in the current directory.
 */

interface Invoice {
  id: string;
  amount: number;
  status: 'PAID' | 'PENDING';
  items: { name: string; price: number }[];
}

// The application's output for the current run (a database row in a real system).
let lastInvoice: Invoice | undefined;

async function generateInvoice(): Promise<void> {
  lastInvoice = {
    id: 'inv_123',
    amount: 500,
    status: 'PAID',
    items: [{ name: 'Subscription', price: 500 }],
  };
}

const invoiceSnapshot = snapshotPromise(
  'final_invoice_state',
  'Invoice should always match the golden state regardless of retries',
  () => lastInvoice ?? { error: 'Invoice not generated' },
);

async function run() {
  const updateSnapshots = process.argv.includes('--update-snapshots');
  const orchestrator = new SearchOrchestrator({
    workflow: async () => {
      lastInvoice = undefined;
      await generateInvoice();
    },
    templates: [], // No faults for this simple demo
    promises: [invoiceSnapshot],
    iterations: 1,
    seed: 'demo-snapshot',
    updateSnapshots,
  });

  console.log(`Running snapshot session${updateSnapshots ? ' (updating snapshots)' : ''}...`);
  const results = await orchestrator.run();

  console.log(`Passed: ${results.passes}`);
  console.log(`Failures: ${results.failures}`);
  const promiseRes = results.results[0]?.promiseResults[0];
  if (promiseRes) {
    console.log(`Promise ${promiseRes.promiseId}: ${promiseRes.passed ? 'PASSED' : 'FAILED'}`);
    if (promiseRes.message) console.log(promiseRes.message);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch(console.error);
}
