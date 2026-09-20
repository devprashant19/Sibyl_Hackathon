import { SearchOrchestrator } from '../src/orchestrator';
import { snapshotPromise } from '../src/promise';
import { AsyncContext } from '../src/async-context';

/**
 * Demonstrates a snapshot promise.
 * 
 * Snapshot promises ensure that the final result of a workflow matches
 * a known "golden" state. This is highly useful for regression testing
 * complex data structures, ensuring faults don't alter the final shape.
 */

const mySnapshotPromise = snapshotPromise(
  'final_invoice_state',
  'Invoice should always match the golden state regardless of retries',
  (ctx) => {
    // In a real system, we'd query the DB for the invoice
    // Here we just extract it from the recorded events
    const allEvents = ctx.events;
    const finalStateEvent = allEvents.find(e => e.type === 'INVOICE_GENERATED');
    return finalStateEvent ? finalStateEvent.payload : { error: 'Invoice not generated' };
  }
);

async function run() {
  const orchestrator = new SearchOrchestrator({
    workflow: async () => {
      const engine = AsyncContext.getEngine();
      if (engine) {
        // Simulate generating an invoice
        (engine as any).recordEvent({
          type: 'INVOICE_GENERATED',
          domain: 'HTTP',
          timestamp: Date.now(),
          payload: {
            id: 'inv_123',
            amount: 500,
            status: 'PAID',
            items: [
              { name: 'Subscription', price: 500 }
            ]
          }
        });
      }
    },
    templates: [], // No faults for this simple demo
    promises: [mySnapshotPromise],
    iterations: 1,
    seed: 'demo-snapshot',
    updateSnapshots: process.argv.includes('--update-snapshots')
  });

  console.log('Running snapshot orchestration session...');
  if (process.argv.includes('--update-snapshots')) {
    console.log('Update snapshots mode is ON');
  }

  const results = await orchestrator.run();
  
  console.log('\nResults:');
  console.log(`Passed: ${results.passes}`);
  console.log(`Failures: ${results.failures}`);
  
  const promiseRes = results.results[0]?.promiseResults[0];
  if (promiseRes) {
    console.log(`Promise ${promiseRes.promiseId}: ${promiseRes.passed ? 'PASSED' : 'FAILED'}`);
    if (promiseRes.message) console.log(promiseRes.message);
  }
}

if (require.main === module) {
  run().catch(console.error);
}
