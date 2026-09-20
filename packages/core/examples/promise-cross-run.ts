import { pathToFileURL } from 'url';
import { AsyncContext, SearchOrchestrator, type ProgrammaticPromise, type SessionPromiseContext } from '@sibyl/core';

/**
 * A cross-run (session-scoped) promise.
 *
 *   cd packages/core && npx tsx examples/promise-cross-run.ts
 *
 * Each run charges a card with an idempotency key. The key generator is flawed: it draws from only
 * 20 values, so across a session two different charges eventually share a key, which a payment
 * provider would treat as the same charge. A run-scoped promise cannot see that; a session-scoped
 * one, evaluated once after all runs, can.
 */

// Simulated provider-side record of successful charges, persisting across runs.
const successfulCharges: { runId: string; idempotencyKey: string }[] = [];

const uniqueIdempotencyKeys: ProgrammaticPromise = {
  id: 'no-duplicate-idempotency-keys',
  description: 'Across all runs, no two successful charges share an idempotency key',
  severity: 'CRITICAL',
  scope: 'session',
  evaluate(ctx) {
    const { runs } = ctx as SessionPromiseContext;
    const seen = new Map<string, string>();
    for (const charge of successfulCharges) {
      const earlier = seen.get(charge.idempotencyKey);
      if (earlier) {
        return {
          passed: false,
          message: `Key ${charge.idempotencyKey} was used by run ${earlier} and run ${charge.runId}`,
        };
      }
      seen.set(charge.idempotencyKey, charge.runId);
    }
    return { passed: true, message: `${successfulCharges.length} charges across ${runs.length} runs, all keys unique` };
  },
};

export async function run() {
  successfulCharges.length = 0;
  const orchestrator = new SearchOrchestrator({
    workflow: async () => {
      const engine = AsyncContext.getEngine();
      // BUG: a 20-value key space. Drawn from the run's PRNG so the session is reproducible.
      const key = `charge_${Math.floor((engine?.getPrng().next() ?? Math.random()) * 20)}`;
      // The charge call may time out (injected), in which case nothing is charged.
      const fault = engine?.evaluateFaultDecision('HTTP', { service: 'payments' });
      if (fault?.type === 'TIMEOUT') return;
      successfulCharges.push({ runId: AsyncContext.getRunId() ?? 'unknown', idempotencyKey: key });
    },
    // The timeout template also gives each run a distinct fault schedule; with no templates at all
    // the orchestrator treats every run as a duplicate of the first and executes only one.
    templates: [
      {
        id: '3a4c2b7e-9f10-4d6b-8e21-5c7d9a0b1c20',
        spec: { domain: 'HTTP', type: 'TIMEOUT' },
        probabilityRange: [0, 0.3],
        target: { service: 'payments' },
      },
    ],
    promises: [uniqueIdempotencyKeys],
    iterations: 10,
    seed: 'demo-cross-run',
  });

  console.log('Running cross-run orchestration session...');
  const results = await orchestrator.run();

  console.log('\nSession promise results:');
  console.log(JSON.stringify(results.sessionPromiseResults, null, 2));
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch(console.error);
}
