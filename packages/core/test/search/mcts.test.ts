import { describe, it, expect, vi } from 'vitest';
import { MctsSearchStrategy } from '../../src/search/mcts';
import { FaultScheduleTemplate } from '@sibyl-shared';
import * as crypto from 'crypto';

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-1234')
}));

describe('MctsSearchStrategy', () => {
  it('should initialize buckets for templates and perform MCTS steps', () => {
    const templates: FaultScheduleTemplate[] = [
      {
        id: 't1',
        target: { service: 'A' },
        spec: { type: 'TIMEOUT' },
        delayMsRange: [100, 500],
        probabilityRange: [0.1, 1.0]
      } as any
    ];

    const strategy = new MctsSearchStrategy(templates, 'seed1');

    // Run 1: Selection, Expansion, Rollout
    const schedule1 = strategy.next(0);
    expect(schedule1.length).toBe(1);
    expect(schedule1[0].spec.delayMs).toBeDefined();

    // Feedback (Backprop)
    strategy.feedback({
      runId: 'r1',
      passed: false, // Reward = 1 (failure)
      concreteSchedules: schedule1
    });

    // Run 2: UCT should guide selection
    const schedule2 = strategy.next(1);
    strategy.feedback({
      runId: 'r2',
      passed: true, // Reward = 0 (pass)
      concreteSchedules: schedule2
    });

    const schedule3 = strategy.next(2);
    expect(schedule3.length).toBe(1);
  });

  it('handles templates without ranges', () => {
    const templates: FaultScheduleTemplate[] = [
      {
        id: 't2',
        target: { service: 'B' },
        spec: { type: 'CRASH' }
      } as any
    ];

    const strategy = new MctsSearchStrategy(templates, 'seed2');
    const schedule = strategy.next(0);
    expect(schedule.length).toBe(1);
    expect(schedule[0].probability).toBe(1);
    expect(schedule[0].spec.delayMs).toBeUndefined();
  });
  
  it('handles UCT node expansion and tree traversal', () => {
    const templates: FaultScheduleTemplate[] = [
      {
        id: 't1',
        target: { service: 'A' },
        spec: { type: 'TIMEOUT' },
        delayMsRange: [10, 50]
      } as any,
      {
        id: 't2',
        target: { service: 'B' },
        spec: { type: 'CRASH' },
        probabilityRange: [0.1, 0.9]
      } as any
    ];
    const strategy = new MctsSearchStrategy(templates, 'seed3');
    
    // Simulate many runs to force tree expansion
    for(let i=0; i<10; i++) {
      const schedules = strategy.next(i);
      expect(schedules.length).toBeGreaterThan(0);
      strategy.feedback({
        runId: `r${i}`,
        passed: i % 2 === 0,
        concreteSchedules: schedules
      });
    }
  });
});
