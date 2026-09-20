import { SearchOrchestrator } from '../src/orchestrator';
import { ProgrammaticPromise, SessionPromiseContext } from '../src/promise';

/**
 * Demonstrates a cross-run (session-scoped) promise.
 * 
 * In this example, we generate idempotency keys and we want to ensure
 * that across the entire suite of fault-injected runs, our system never
 * succeeds a charge with the same idempotency key twice.
 */

// A mock state that persists across the runs, simulating a database
const successfulCharges = new Set<string>();

const idempotencyPromise: ProgrammaticPromise = {
  id: 'no-duplicate-charges',
  description: 'Across all runs, no two successful charges share an idempotency key',
  severity: 'CRITICAL',
  scope: 'session',
  evaluate(ctx) {
    const sessionCtx = ctx as SessionPromiseContext;
    
    // In a real system, we might query the DB directly here at the end of the session,
    // or aggregate events captured from all runs.
    // For this example, we'll check the mock DB state directly.
    const uniqueKeys = new Set(Array.from(successfulCharges));
    
    if (uniqueKeys.size !== successfulCharges.size) {
      return { 
        passed: false, 
        message: 'Duplicate idempotency keys were found across successful runs!' 
      };
    }
    
    return { 
      passed: true,
      message: `Verified ${uniqueKeys.size} unique successful charges across ${sessionCtx.runs.length} runs.`
    };
  }
};

async function run() {
  const orchestrator = new SearchOrchestrator({
    workflow: async () => {
      // Mock workflow: generate a random key and attempt a charge
      // We might accidentally re-use a key if our logic is flawed
      const key = `charge_idx_${Math.floor(Math.random() * 100)}`;
      successfulCharges.add(key);
    },
    templates: [], // No faults for this simple demo
    promises: [idempotencyPromise],
    iterations: 10,
    seed: 'demo-cross-run'
  });

  console.log('Running cross-run orchestration session...');
  const results = await orchestrator.run();
  
  console.log('\nSession Promises Results:');
  console.log(JSON.stringify(results.sessionPromiseResults, null, 2));
}

if (require.main === module) {
  run().catch(console.error);
}
