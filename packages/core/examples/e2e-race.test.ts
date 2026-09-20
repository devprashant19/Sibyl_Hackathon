import { describe, it, expect } from 'vitest';
import { SearchOrchestrator } from '../src/orchestrator';
import { AsyncContext } from '../src/async-context';
import { ProgrammaticPromise } from '../src/promise';
import { FaultDriver, DriverContext } from '../src/driver';
import { FaultScheduleTemplate } from '@sibyl-shared';

// We'll simulate a race condition bug where reading and updating an inventory value
// has a gap, and two concurrent requests can both successfully "checkout" the last item.

let inventory = 1; // 1 item left
let successCount = 0;

// This is our vulnerable "Express app" handler
async function handleCheckout() {
  // 1. Read inventory
  const currentInventory = inventory;
  
  // -- VULNERABILITY WINDOW --
  // We simulate a database query latency here that might be fuzzed
  const engine = AsyncContext.getEngine();
  const fault = engine?.evaluateFaultDecision('DATABASE', { query: 'SELECT inventory' });
  
  if (fault?.type === 'SLOW_QUERY' && fault.delayMs) {
    // Await the fuzzed delay using the virtual clock
    await new Promise(r => setTimeout(r, fault.delayMs));
  } else {
    // Normal query is fast (10ms)
    await new Promise(r => setTimeout(r, 10));
  }
  
  engine?.recordEvent({
    domain: 'DATABASE',
    payload: { query: 'SELECT inventory', returned: currentInventory }
  });

  // 2. Check if we can checkout
  if (currentInventory > 0) {
    // 3. Update inventory
    inventory = currentInventory - 1;
    successCount++;
    
    engine?.recordEvent({
      domain: 'HTTP',
      payload: { method: 'POST', url: '/checkout', status: 200 }
    });
  } else {
    engine?.recordEvent({
      domain: 'HTTP',
      payload: { method: 'POST', url: '/checkout', status: 400 }
    });
  }
}

// A mock driver that just registers itself but relies on our inline interception above
class MockDbDriver implements FaultDriver {
  domain: 'DATABASE' = 'DATABASE';
  install(ctx: DriverContext) {}
  uninstall() {}
}

class MockHttpDriver implements FaultDriver {
  domain: 'HTTP' = 'HTTP';
  install(ctx: DriverContext) {}
  uninstall() {}
}

describe('Search Orchestrator E2E Race Condition', () => {
  it('discovers a timing vulnerability (race condition) through fuzzing', async () => {
    // We expect inventory to never drop below 0, and successCount to never exceed 1
    // since we only started with 1 item.
    const NoNegativeInventoryPromise: ProgrammaticPromise = {
      id: 'no-negative-inventory',
      description: 'Inventory must never be double-spent (successCount <= 1)',
      severity: 'CRITICAL',
      evaluate(ctx) {
        // Evaluate by analyzing HTTP events
        const httpEvents = ctx.timeline(e => e.domain === 'HTTP');
        const successes = httpEvents.filter(e => e.payload.status === 200).length;
        return successes <= 1;
      }
    };

    const templates: FaultScheduleTemplate[] = [
      {
        id: 'fuzz-db-latency',
        spec: { domain: 'DATABASE', type: 'SLOW_QUERY' },
        probabilityRange: [0.1, 1.0], // 10% to 100% chance to trigger
        delayMsRange: [100, 500], // Fuzz latency between 100ms and 500ms
        target: { query: 'SELECT inventory' }
      }
    ];

    const orchestrator = new SearchOrchestrator({
      workflow: async () => {
        // Reset state for this run
        inventory = 1;
        successCount = 0;
        
        // Simulate two concurrent requests hitting our express app
        await Promise.all([
          handleCheckout(),
          handleCheckout()
        ]);
      },
      templates,
      promises: [NoNegativeInventoryPromise],
      iterations: 30, // Run up to 30 times
      concurrency: 1, // Must be 1 because inventory state is global in this file
      earlyExit: true, // Stop as soon as the race condition is hit!
      seed: 'e2e-race-seed', // Fixed seed for test determinism
      clockOptions: { mode: 'realtime' } // Need realtime for standard setTimeouts to actually overlap, though virtual clock works if we use VirtualClock's runAllAsync() in the orchestrator, but we are using real setTimeout for now
    });

    orchestrator.registerDriver(new MockDbDriver());
    orchestrator.registerDriver(new MockHttpDriver());

    const result = await orchestrator.run();

    // Since we fuzzed the latency of the SELECT query independently for the two concurrent requests,
    // they should overlap eventually, causing BOTH to read `inventory = 1`, and both to increment `successCount`.
    
    // The orchestrator should have early exited!
    expect(result.totalRuns).toBeLessThanOrEqual(20);
    expect(result.failures).toBeGreaterThan(0);
    expect(result.worstRun).toBeDefined();
    
    // The failing run should show the broken promise
    const failedPromise = result.worstRun!.promiseResults[0];
    expect(failedPromise.passed).toBe(false);
  }, 15000);
});
