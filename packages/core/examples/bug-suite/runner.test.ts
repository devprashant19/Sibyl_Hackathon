import { describe, it, expect } from 'vitest';
import { MctsSearchStrategy, SearchOrchestrator, type ProgrammaticPromise } from '@sibyl/core';
import type { FaultScheduleTemplate } from '@sibyl/shared';
import { lostUpdatePromise, lostUpdateTemplates, lostUpdateWorkflow } from './lost-update';
import { webhookPromise, webhookTemplates, webhookWorkflow } from './webhook-idempotency';
import { rollbackPromise, rollbackTemplates, rollbackWorkflow } from './partial-rollback';
import { mqDuplicatePromise, mqDuplicateTemplates, mqWorkflow } from './mq-duplicate';

/**
 * Regression suite for the search: four classic bug classes, each triggered only by an injected
 * fault. With a fixed seed the MCTS strategy must find each bug within the run budget, and the same
 * workflow must pass when no faults are injected (so the failure is the fault's doing).
 *
 * core's vitest.config.ts excludes examples/ from `pnpm test`, so run it explicitly:
 *
 *   cd packages/core && npx vitest run --dir examples --config examples/vitest.config.ts
 */

const SEED = 'bug-suite-42';
const RUN_BUDGET = 50;

interface Bug {
  name: string;
  workflow: () => Promise<void>;
  templates: FaultScheduleTemplate[];
  promise: ProgrammaticPromise;
}

const suite: Bug[] = [
  { name: 'lost update', workflow: lostUpdateWorkflow, templates: lostUpdateTemplates, promise: lostUpdatePromise },
  { name: 'webhook double charge', workflow: webhookWorkflow, templates: webhookTemplates, promise: webhookPromise },
  { name: 'partial rollback', workflow: rollbackWorkflow, templates: rollbackTemplates, promise: rollbackPromise },
  { name: 'MQ duplicate processing', workflow: mqWorkflow, templates: mqDuplicateTemplates, promise: mqDuplicatePromise },
];

describe('bug suite', () => {
  for (const bug of suite) {
    it(`MCTS finds the ${bug.name} bug within ${RUN_BUDGET} runs`, async () => {
      const orchestrator = new SearchOrchestrator({
        workflow: bug.workflow,
        templates: bug.templates,
        promises: [bug.promise],
        iterations: RUN_BUDGET,
        earlyExit: true,
        seed: SEED,
        strategy: new MctsSearchStrategy(bug.templates, SEED),
      });

      const result = await orchestrator.run();

      expect(result.failures).toBeGreaterThan(0);
      expect(result.totalRuns).toBeLessThanOrEqual(RUN_BUDGET);
      expect(result.worstRun?.status).toBe('FAILED'); // reproducible, not INTERMITTENT
      const failed = result.worstRun?.promiseResults.find(r => r.promiseId === bug.promise.id);
      expect(failed?.passed).toBe(false);
    });

    it(`the ${bug.name} workflow passes without faults`, async () => {
      const orchestrator = new SearchOrchestrator({
        workflow: bug.workflow,
        templates: [],
        promises: [bug.promise],
        iterations: 1, // with no templates every further run would be a duplicate of the first
        seed: SEED,
      });

      const result = await orchestrator.run();

      expect(result.failures).toBe(0);
      expect(result.passes).toBeGreaterThan(0);
    });
  }
});
