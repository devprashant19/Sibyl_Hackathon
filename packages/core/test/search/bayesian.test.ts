import { describe, it, expect, vi } from 'vitest';
import { BayesianSearchStrategy } from '../../src/search/bayesian';
import { FaultScheduleTemplate } from '@sibyl-shared';
import * as crypto from 'crypto';

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-1234')
}));

describe('BayesianSearchStrategy', () => {
  it('should sample uniformly if fewer than 3 samples exist in history', () => {
    const templates: FaultScheduleTemplate[] = [
      {
        id: 't1',
        target: { service: 'A', method: 'B' },
        spec: { type: 'SLOW_RESPONSE' },
        delayMsRange: [100, 500]
      } as any
    ];
    
    const strategy = new BayesianSearchStrategy(templates, 'seed1');
    const schedule1 = strategy.next(0);
    
    expect(schedule1.length).toBe(1);
    expect(schedule1[0].spec.delayMs).toBeGreaterThanOrEqual(100);
    expect(schedule1[0].spec.delayMs).toBeLessThanOrEqual(500);

    // Provide some feedback to populate history, but less than 2 failures and 2 passes
    strategy.feedback({
      runId: 'r1',
      passed: true,
      concreteSchedules: schedule1
    });

    const schedule2 = strategy.next(1);
    expect(schedule2[0].spec.delayMs).toBeDefined();
  });

  it('should use KDE to pick best candidates when sufficient history exists', () => {
    const templates: FaultScheduleTemplate[] = [
      {
        id: 't2',
        target: { service: 'A', method: 'B' },
        spec: { type: 'SLOW_RESPONSE' },
        delayMsRange: [10, 100],
        probabilityRange: [0.5, 1.0]
      } as any
    ];

    const strategy = new BayesianSearchStrategy(templates, 'seed2');
    
    // Fake enough history: 2 passes, 2 failures
    strategy['history'] = [
      { templateId: 't2', passed: true, delay: 20 },
      { templateId: 't2', passed: true, delay: 30 },
      { templateId: 't2', passed: false, delay: 90 },
      { templateId: 't2', passed: false, delay: 85 }
    ];

    const schedule = strategy.next(0);
    expect(schedule.length).toBe(1);
    expect(schedule[0].spec.delayMs).toBeGreaterThanOrEqual(10);
    expect(schedule[0].spec.delayMs).toBeLessThanOrEqual(100);
    expect(schedule[0].probability).toBeGreaterThanOrEqual(0.5);
    expect(schedule[0].probability).toBeLessThanOrEqual(1.0);
  });

  it('handles empty KDE distributions safely (no passes or no failures)', () => {
    const templates: FaultScheduleTemplate[] = [
      {
        id: 't3',
        target: { service: 'A' },
        spec: { type: 'HTTP_5XX' },
        delayMsRange: [10, 20]
      } as any
    ];

    const strategy = new BayesianSearchStrategy(templates, 'seed3');
    strategy['history'] = [
      { templateId: 't3', passed: true, delay: 15 },
      { templateId: 't3', passed: true, delay: 15 },
      { templateId: 't3', passed: true, delay: 15 },
    ];

    const schedule = strategy.next(0);
    expect(schedule[0].spec.delayMs).toBeDefined();
  });
});
