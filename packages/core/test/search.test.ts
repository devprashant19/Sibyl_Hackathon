import { describe, it, expect } from 'vitest';
import { Ucb1SearchStrategy } from '../src/search/ucb1';
import { FaultScheduleTemplate } from '@sibyl-shared';

describe('UCB1 Search Strategy', () => {
  const templates: FaultScheduleTemplate[] = [
    {
      id: 'http-timeout',
      spec: { domain: 'HTTP', type: 'TIMEOUT' },
      probabilityRange: [0, 1] // 4 buckets
    }
  ];

  it('explores all buckets systematically before exploiting', () => {
    const strategy = new Ucb1SearchStrategy(templates, 'test-seed');
    
    // There are 4 buckets for the probability range.
    // The first 4 calls to next() should ideally yield 4 unique probabilities
    // because UCB1 forces visiting unvisited nodes first.
    
    const seenProbs = new Set<number>();
    
    for (let i = 0; i < 4; i++) {
      const schedules = strategy.next(i);
      seenProbs.add(schedules[0].probability);
      
      // Feedback pass
      strategy.feedback({
        runId: `run-${i}`,
        seed: 'seed',
        concreteSchedules: schedules,
        promiseResults: [],
        passed: true
      });
    }

    expect(seenProbs.size).toBe(4);
  });

  it('enters shrink mode upon failure and minimizes schedule', () => {
    const multiTemplates: FaultScheduleTemplate[] = [
      { id: 't1', spec: { domain: 'HTTP' } },
      { id: 't2', spec: { domain: 'DATABASE' } }
    ];

    const strategy = new Ucb1SearchStrategy(multiTemplates, 'shrink-seed');
    
    const sched = strategy.next(0);
    expect(sched.length).toBe(2);

    // Report a failure
    strategy.feedback({
      runId: 'r1',
      seed: 's1',
      concreteSchedules: sched,
      promiseResults: [],
      passed: false
    });

    // The next schedule provided should be a shrunk version of the failing schedule
    // Since there were 2 faults, pruning means it should try schedules with 1 fault.
    const shrink1 = strategy.next(1);
    expect(shrink1.length).toBe(1);

    const shrink2 = strategy.next(2);
    expect(shrink2.length).toBe(1);
  });
});
