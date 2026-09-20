import { describe, it, expect } from 'vitest';
import { SearchOrchestrator } from '../src/orchestrator';
import { Ucb1SearchStrategy } from '../src/search/ucb1';
import { MctsSearchStrategy } from '../src/search/mcts';
import { BayesianSearchStrategy } from '../src/search/bayesian';
import { ProgrammaticPromise, createPromiseContext } from '../src/promise';
import { FaultScheduleTemplate } from '@sibyl-shared';
import { AsyncContext } from '../src/async-context';

describe('Search Strategy Benchmarks', () => {

  async function simulateCombinatorialBug() {
    const engine = AsyncContext.getEngine();
    
    // We require EXACTLY fault A, B, and C in order to trigger the bug.
    const fA = engine?.evaluateFaultDecision('HTTP', { target: 'A' });
    const fB = engine?.evaluateFaultDecision('DATABASE', { target: 'B' });
    const fC = engine?.evaluateFaultDecision('MESSAGE_QUEUE', { target: 'C' });

    if (fA?.type === 'TIMEOUT' && fB?.type === 'DEADLOCK' && fC?.type === 'MESSAGE_LOSS') {
      engine?.recordEvent({ domain: 'HTTP', payload: { status: 'BUG_TRIGGERED' } });
    } else {
      engine?.recordEvent({ domain: 'HTTP', payload: { status: 'OK' } });
    }
  }

  it('MCTS discovers deep combinatorial bugs effectively', async () => {
    const NoBugPromise: ProgrammaticPromise = {
      id: 'no-bug',
      description: 'System should not trigger the combinatorial bug',
      severity: 'CRITICAL',
      evaluate: (ctx) => !ctx.timeline().some(e => e.payload.status === 'BUG_TRIGGERED')
    };

    const templates: FaultScheduleTemplate[] = [
      { id: 't1', spec: { domain: 'HTTP', type: 'TIMEOUT' }, probabilityRange: [0, 1], target: { target: 'A' } },
      { id: 't2', spec: { domain: 'DATABASE', type: 'DEADLOCK' }, probabilityRange: [0, 1], target: { target: 'B' } },
      { id: 't3', spec: { domain: 'MESSAGE_QUEUE', type: 'MESSAGE_LOSS' }, probabilityRange: [0, 1], target: { target: 'C' } },
      { id: 't4', spec: { domain: 'HTTP', type: '500_ERROR' }, probabilityRange: [0, 1] }, // Noise
      { id: 't5', spec: { domain: 'DATABASE', type: 'SLOW_QUERY' }, probabilityRange: [0, 1] }, // Noise
    ];

    const orchestrator = new SearchOrchestrator({
      workflow: simulateCombinatorialBug,
      templates,
      promises: [NoBugPromise],
      iterations: 300,
      earlyExit: true,
      seed: 'benchmark-seed-mcts'
    });

    // We can inject MCTS strategy by swapping it
    (orchestrator as any).strategy = new MctsSearchStrategy(templates, 'benchmark-seed-mcts');

    const result = await orchestrator.run();
    expect(result.failures).toBeGreaterThan(0);
    // MCTS typically finds this within a few dozen iterations due to UCT tree expansion biasing towards unvisited combinations.
  });

  async function simulateRaceCondition() {
    const engine = AsyncContext.getEngine();
    
    // Bug only triggers if delay is precisely between 330 and 340ms
    const f = engine?.evaluateFaultDecision('DATABASE', { query: 'SELECT balance' });
    
    if (f?.type === 'SLOW_QUERY' && f.delayMs !== undefined && f.delayMs >= 330 && f.delayMs <= 340) {
      engine?.recordEvent({ domain: 'DATABASE', payload: { race: 'TRIGGERED' } });
    } else {
      engine?.recordEvent({ domain: 'DATABASE', payload: { race: 'SAFE' } });
    }
  }

  it('Bayesian Strategy (TPE) discovers tight timing windows', async () => {
    const SafeRacePromise: ProgrammaticPromise = {
      id: 'safe-race',
      description: 'System should not trigger race condition',
      severity: 'CRITICAL',
      evaluate: (ctx) => !ctx.timeline().some(e => e.payload.race === 'TRIGGERED')
    };

    const templates: FaultScheduleTemplate[] = [
      { id: 't1', spec: { domain: 'DATABASE', type: 'SLOW_QUERY' }, delayMsRange: [100, 500] }
    ];

    const orchestrator = new SearchOrchestrator({
      workflow: simulateRaceCondition,
      templates,
      promises: [SafeRacePromise],
      iterations: 300,
      earlyExit: true,
      seed: 'benchmark-seed-bayes'
    });

    (orchestrator as any).strategy = new BayesianSearchStrategy(templates, 'benchmark-seed-bayes');

    const result = await orchestrator.run();
    expect(result.failures).toBeGreaterThan(0);
  });

});
