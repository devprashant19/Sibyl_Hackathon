import { describe, it, expect, vi } from 'vitest';
import { SearchOrchestrator } from '../src/orchestrator';
import { Ucb1SearchStrategy } from '../src/search/ucb1';
import { SearchStrategy } from '../src/search/strategy';
import { FaultSchedule, PromiseResult, FaultScheduleTemplate } from '@sibyl-shared';
import * as crypto from 'crypto';

describe('SearchOrchestrator Advanced Features', () => {
  const dummyTemplates: FaultScheduleTemplate[] = [
    { id: 'T1', spec: { domain: 'HTTP', type: 'SLOW_RESPONSE', delayMs: 100 }, target: { service: 'A' }, probabilityRange: [0.5, 0.5] }
  ];

  it('should support pausing and resuming via state export/import', async () => {
    let workflowRuns = 0;
    const config = {
      workflow: async () => { workflowRuns++; },
      templates: dummyTemplates,
      promises: [],
      iterations: 5,
      seed: 'test-seed-123'
    };

    const orchestrator1 = new SearchOrchestrator(config);
    const result1 = await orchestrator1.run();
    expect(result1.totalRuns).toBe(5);
    expect(workflowRuns).toBe(5);

    const state = orchestrator1.exportState();
    expect(state.iterationsDone).toBe(5);
    expect(state.results.length).toBe(5);

    const orchestrator2 = SearchOrchestrator.resume(state, { ...config, iterations: 10 });
    const result2 = await orchestrator2.run();
    
    expect(result2.totalRuns).toBe(10);
    expect(workflowRuns).toBe(10);
    expect(result2.results.length).toBe(10);
  });

  it('should deduplicate functionally equivalent schedules and not consume budget', async () => {
    class FixedStrategy implements SearchStrategy {
      feedback() {}
      next() {
        return [{ id: crypto.randomUUID(), spec: { domain: 'HTTP', type: 'SLOW_RESPONSE', delayMs: 100 }, target: { service: 'A' }, probability: 1.0 } as any];
      }
    }

    let workflowRuns = 0;
    const config = {
      workflow: async () => { workflowRuns++; },
      templates: [],
      promises: [],
      iterations: 3,
      strategy: new FixedStrategy()
    };

    const orchestrator = new SearchOrchestrator(config);
    const result = await orchestrator.run();
    
    expect(workflowRuns).toBe(1);
    expect(result.totalRuns).toBe(1);
  });

  it('should detect flaky promises and report them as INTERMITTENT', async () => {
    let callCount = 0;
    
    const flakyPromise = {
      id: 'flake1',
      evaluate: async () => {
        callCount++;
        if (callCount === 1) {
          return { passed: false };
        }
        return { passed: true };
      }
    } as any;

    const config = {
      workflow: async () => {},
      templates: dummyTemplates,
      promises: [flakyPromise],
      iterations: 1,
      seed: 'flake-seed'
    };

    const orchestrator = new SearchOrchestrator(config);
    const result = await orchestrator.run();

    expect(result.results.length).toBe(1);
    expect(result.results[0].status).toBe('INTERMITTENT');
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].promiseResults[0].intermittent).toBe(true);
    
    expect(callCount).toBe(2);
  });
});
