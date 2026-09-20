import { describe, it, expect, vi } from 'vitest';
import { SearchOrchestrator } from '../src/orchestrator';
import { executePromise, createPromiseContext } from '../src/promise';
import { SimulationEngine } from '../src/engine';

describe('Orchestration Boundaries & Resiliency', () => {

  describe('SearchOrchestrator boundaries', () => {
    it('gracefully handles malformed FaultSchedules from strategy', async () => {
      const badStrategy = {
        next: () => [{ badField: 'not-a-valid-schedule' }],
        feedback: vi.fn()
      };

      const orchestrator = new SearchOrchestrator({
        workflow: async () => {},
        templates: [],
        promises: [],
        iterations: 1,
        strategy: badStrategy as any
      });

      const result = await orchestrator.run();
      expect(result.errored).toBe(1);
      expect(result.results[0].status).toBe('ERRORED');
      expect(result.results[0].error).toContain('Malformed FaultSchedule');
    });

    it('gracefully handles synchronous target workflow crashes', async () => {
      const orchestrator = new SearchOrchestrator({
        workflow: () => {
          throw new Error('Unexpected synchronous crash');
        },
        templates: [],
        promises: [],
        iterations: 1
      });

      const result = await orchestrator.run();
      expect(result.errored).toBe(1);
      expect(result.results[0].status).toBe('ERRORED');
      expect(result.results[0].error).toContain('Unexpected synchronous crash');
    });
  });

  describe('Promise boundary resiliency', () => {
    it('catches exceptions thrown during promise evaluation', async () => {
      const crashingPromise = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        description: 'I will crash',
        severity: 'CRITICAL' as const,
        evaluate: () => {
          throw new Error('Boom');
        }
      };

      const ctx = createPromiseContext('run-1', []);
      const result = await executePromise(crashingPromise, ctx, Date.now());

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Promise evaluation crashed: Boom');
    });

    it('handles promise evaluations that return invalid types', async () => {
      const invalidPromise = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        description: 'I will return null',
        severity: 'CRITICAL' as const,
        evaluate: () => null as any
      };

      const ctx = createPromiseContext('run-2', []);
      const result = await executePromise(invalidPromise, ctx, Date.now());

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Promise evaluation returned invalid result type');
    });
  });

  describe('Driver lifecycle idempotency', () => {
    it('does not crash when driver install is called twice on the engine', () => {
      const engine = new SimulationEngine({
        id: '123e4567-e89b-12d3-a456-426614174000',
        environment: 'LOCAL_PROCESS',
        status: 'PENDING',
        schedules: []
      }, 'seed');

      let installCount = 0;
      let uninstallCount = 0;
      
      const mockDriver = {
        domain: 'HTTP' as const,
        install: () => { installCount++; },
        uninstall: () => { uninstallCount++; }
      };

      // Call twice
      engine.installDriver(mockDriver);
      engine.installDriver(mockDriver);
      expect(installCount).toBe(1); // The engine shouldn't call install twice

      // Stop engine multiple times
      engine.stop();
      engine.stop();
      expect(uninstallCount).toBe(1); // The engine should only clear drivers once
    });
  });
});
