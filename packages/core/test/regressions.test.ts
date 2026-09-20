import { describe, it, expect, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { PRNG } from '../src/prng';
import { VirtualClock } from '../src/clock';
import { SimulationEngine } from '../src/engine';
import { SearchOrchestrator } from '../src/orchestrator';
import { MctsSearchStrategy } from '../src/search/mcts';
import { BayesianSearchStrategy } from '../src/search/bayesian';
import { SandboxProvider } from '../src/sandbox/provider';
import { FaultDriver, DriverContext } from '../src/driver';
import { FaultScheduleTemplate } from '@sibyl/shared';

const NativeSetTimeout = setTimeout;
const NativeDate = Date;

// Each test below pins a defect that existed in the code. The comment says what used to happen.

describe('PRNG', () => {
  it('keeps its state inside 32 bits (it used to grow as a double and lose precision)', () => {
    const rng = new PRNG('seed');
    for (let i = 0; i < 100_000; i++) rng.next();
    const { state } = rng.exportState();
    expect(Number.isInteger(state)).toBe(true);
    expect(state).toBeGreaterThanOrEqual(0);
    expect(state).toBeLessThan(2 ** 32);
  });

  it('draws reproducible v4-shaped uuids', () => {
    const a = new PRNG('x').uuid();
    expect(a).toBe(new PRNG('x').uuid());
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('VirtualClock', () => {
  afterEach(() => {
    VirtualClock.setContextResolver(null);
  });

  it('advances Date.now() in real-time mode (it used to freeze at install time)', async () => {
    const clock = new VirtualClock();
    clock.install({ mode: 'real-time' });
    try {
      const start = Date.now();
      await new Promise(r => NativeSetTimeout(r, 30));
      expect(Date.now() - start).toBeGreaterThanOrEqual(20);
    } finally {
      clock.uninstall();
    }
  });

  it('returns timer handles with refresh() (undici calls it, so fetch used to break)', () => {
    const clock = new VirtualClock();
    clock.install({ mode: 'accelerated', startTime: 0 });
    try {
      let fired = 0;
      const handle: any = setTimeout(() => fired++, 100);
      expect(typeof handle.refresh).toBe('function');
      expect(typeof handle.hasRef).toBe('function');
      clock.advance(60);
      handle.refresh(); // restart the 100ms countdown from t=60
      clock.advance(60);
      expect(fired).toBe(0);
      clock.advance(40);
      expect(fired).toBe(1);
    } finally {
      clock.uninstall();
    }
  });

  it('supports Date() without new and keeps instanceof working', () => {
    const clock = new VirtualClock();
    clock.install({ mode: 'accelerated', startTime: 0 });
    try {
      expect(typeof (Date as any)()).toBe('string');
      expect(new Date()).toBeInstanceOf(NativeDate);
      expect(new NativeDate(0)).toBeInstanceOf(Date);
      expect(new Date(5).getTime()).toBe(5);
    } finally {
      clock.uninstall();
    }
  });

  it('restores native globals when clocks overlap (a clock built during another used to capture the fake)', () => {
    const a = new VirtualClock();
    a.install({ mode: 'accelerated', startTime: 0 });
    const b = new VirtualClock(); // constructed while `a` is installed
    b.install({ mode: 'accelerated', startTime: 0 });
    a.uninstall();
    b.uninstall();
    expect(globalThis.setTimeout).toBe(NativeSetTimeout);
    expect(globalThis.Date).toBe(NativeDate);
  });
});

describe('SimulationEngine', () => {
  it('never fires a probability-0 schedule', () => {
    const engine = new SimulationEngine({
      id: crypto.randomUUID(), environment: 'LOCAL_PROCESS', status: 'PENDING',
      schedules: [{ id: crypto.randomUUID(), probability: 0, spec: { domain: 'HTTP', type: 'TIMEOUT' } }],
    }, 'seed');
    for (let i = 0; i < 1000; i++) expect(engine.evaluateFaultDecision('HTTP', {})).toBeNull();
  });

  it('applies clock skewMs (it used to be ignored)', () => {
    const engine = new SimulationEngine({
      id: crypto.randomUUID(), environment: 'LOCAL_PROCESS', status: 'PENDING', schedules: [],
    }, 'seed', { mode: 'accelerated', startTime: 1000, skewMs: 500 });
    engine.start();
    try {
      expect(Date.now()).toBe(1500);
    } finally {
      engine.stop();
    }
  });
});

const httpTemplate = (probabilityRange: [number, number]): FaultScheduleTemplate => ({
  id: crypto.randomUUID(),
  spec: { domain: 'HTTP', type: 'TIMEOUT' },
  probabilityRange,
});

describe('SearchOrchestrator', () => {
  it('does not overshoot iterations under concurrency', async () => {
    let executions = 0;
    const orchestrator = new SearchOrchestrator({
      workflow: async () => {
        executions++;
        await new Promise(r => setTimeout(r, 5));
      },
      templates: [httpTemplate([0, 1])],
      promises: [],
      iterations: 10,
      concurrency: 4,
      seed: 'concurrency',
    });
    const result = await orchestrator.run();
    expect(result.totalRuns).toBe(10);
    expect(executions).toBe(10);
  });

  it('lets UCB1 learn through the orchestrator (zod used to strip its bucket keys)', async () => {
    const probabilities = new Set<number>();
    const orchestrator = new SearchOrchestrator({
      workflow: async () => {},
      templates: [httpTemplate([0, 1])],
      promises: [],
      iterations: 4,
      seed: 'ucb1',
      onRunComplete: run => probabilities.add(run.concreteSchedules[0].probability),
    });
    await orchestrator.run();
    // Without feedback every bucket looked unvisited and bucket 0 won every time.
    expect(probabilities.size).toBe(4);
  });

  it('lets the Bayesian strategy record history through the orchestrator', async () => {
    const template: FaultScheduleTemplate = {
      id: crypto.randomUUID(), spec: { domain: 'HTTP', type: 'SLOW_RESPONSE' }, delayMsRange: [10, 100],
    };
    const strategy = new BayesianSearchStrategy([template], 'bayes');
    const orchestrator = new SearchOrchestrator({
      workflow: async () => {}, templates: [template], promises: [], iterations: 5, seed: 'bayes', strategy,
    });
    await orchestrator.run();
    expect(strategy.exportState().history.length).toBe(5);
  });

  it('cleans up the sandbox when the run crashes (it used to leak the container)', async () => {
    let cleaned = 0;
    const provider: SandboxProvider = {
      async createSandbox() {
        return {
          id: 'sb',
          start: async () => { throw new Error('container failed to start'); },
          stop: async () => {},
          cleanup: async () => { cleaned++; },
          executePressureFault: async () => {},
          executeCrashFault: async () => {},
        };
      },
    };
    const orchestrator = new SearchOrchestrator({
      workflow: async () => {}, templates: [], promises: [], iterations: 1, sandboxProvider: provider,
    });
    const result = await orchestrator.run();
    expect(result.errored).toBe(1);
    expect(cleaned).toBe(1);
  });

  it('errors a run that exceeds runTimeoutMs instead of hanging the search', async () => {
    const orchestrator = new SearchOrchestrator({
      workflow: () => new Promise(() => {}),
      templates: [], promises: [], iterations: 1, runTimeoutMs: 50,
    });
    const result = await orchestrator.run();
    expect(result.results[0].status).toBe('ERRORED');
    expect(result.results[0].error).toContain('runTimeoutMs');
  });

  it('completes timer-based workflows instantly on an accelerated clock, isolated per concurrent run', async () => {
    const elapsed: number[] = [];
    const orchestrator = new SearchOrchestrator({
      workflow: async () => {
        const start = Date.now();
        await new Promise(r => setTimeout(r, 60_000));
        elapsed.push(Date.now() - start);
      },
      templates: [httpTemplate([0, 1])],
      promises: [],
      iterations: 4,
      concurrency: 2,
      seed: 'accelerated',
      runTimeoutMs: 2_000,
      clockOptions: { mode: 'accelerated' },
    });
    const wallStart = NativeDate.now();
    const result = await orchestrator.run();
    expect(result.errored).toBe(0);
    expect(elapsed).toEqual([60_000, 60_000, 60_000, 60_000]);
    expect(NativeDate.now() - wallStart).toBeLessThan(2_000);
    expect(globalThis.setTimeout).toBe(NativeSetTimeout);
  });

  it('skews the workflow clock when a CLOCK schedule fires', async () => {
    let observedSkew = 0;
    const orchestrator = new SearchOrchestrator({
      workflow: async () => { observedSkew = Date.now() - NativeDate.now(); },
      templates: [{ id: crypto.randomUUID(), spec: { domain: 'CLOCK', type: 'CLOCK_SKEW', offsetMs: 3_600_000 } }],
      promises: [],
      iterations: 1,
      seed: 'clock',
    });
    const result = await orchestrator.run();
    expect(observedSkew).toBeGreaterThan(3_500_000);
    expect(result.results[0].eventCount).toBe(1);
  });

  it('replays a failing run to the same outcome and timeline', async () => {
    class CountingDriver implements FaultDriver {
      domain = 'HTTP' as const;
      ctx?: DriverContext;
      install(ctx: DriverContext) { this.ctx = ctx; }
      uninstall() { this.ctx = undefined; }
      call(url: string) {
        const fault = this.ctx!.getFaultDecision('HTTP', { url });
        this.ctx!.recordEvent({ domain: 'HTTP', payload: { method: 'GET', url, statusCode: fault ? 503 : 200, durationMs: 1 } } as any);
        return !fault;
      }
    }
    const make = () => {
      const driver = new CountingDriver();
      const orchestrator = new SearchOrchestrator({
        workflow: async () => { for (let i = 0; i < 20; i++) driver.call(`/item/${i}`); },
        templates: [httpTemplate([0.2, 0.2])],
        promises: [{
          id: 'all-ok', description: 'every call succeeds', severity: 'CRITICAL',
          evaluate: (ctx: any) => ctx.events.every((e: any) => e.payload.statusCode === 200),
        }],
        iterations: 3,
        seed: 'replay',
        flakeRetries: 0,
      });
      orchestrator.registerDriver(driver);
      return orchestrator;
    };

    const result = await make().run();
    const failed = result.results.find(r => r.status === 'FAILED');
    expect(failed).toBeDefined();

    const replayed = await make().replay(failed!);
    expect(replayed.status).toBe('FAILED');
    // Timestamps are wall-clock in real-time mode; the decisions and payloads are what replay.
    const strip = (events: any[]) => events.map(({ timestamp, ...rest }) => rest);
    expect(strip(replayed.events!)).toEqual(strip(failed!.events!));
  });
});

describe('MctsSearchStrategy', () => {
  const twoTemplates: FaultScheduleTemplate[] = [
    { id: 'a', spec: { domain: 'HTTP', type: 'TIMEOUT' }, probabilityRange: [0, 1] },
    { id: 'b', spec: { domain: 'DATABASE', type: 'DEADLOCK' }, probabilityRange: [0, 1] },
  ];

  it('can reach every bucket of a later template under every root child (later children used to lose moves)', () => {
    const strategy = new MctsSearchStrategy(twoTemplates, 'tree');
    for (let i = 0; i < 64; i++) {
      const s = strategy.next(i);
      strategy.feedback({ runId: `r${i}`, seed: 's', concreteSchedules: s, promiseResults: [], passed: true });
    }
    const { root } = strategy.exportState();
    expect(root.children.length).toBe(4);
    for (const child of root.children) {
      expect(child.children.length + child.unexpanded.length).toBe(4);
    }
  });

  it('credits the leaf that produced a schedule even when feedback arrives out of order', () => {
    const strategy = new MctsSearchStrategy(twoTemplates, 'order');
    const first = strategy.next(0);
    const second = strategy.next(1);
    strategy.feedback({ runId: 'r2', seed: 's', concreteSchedules: second, promiseResults: [], passed: true });
    strategy.feedback({ runId: 'r1', seed: 's', concreteSchedules: first, promiseResults: [], passed: false });

    const { root } = strategy.exportState();
    const firstChoice = root.children.find((c: any) => c.choice.probBucket === (first[0].probability * 4 - 0.5));
    expect(root.visits).toBe(2);
    expect(firstChoice.failures).toBe(1);
  });
});
