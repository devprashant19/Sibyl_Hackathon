import { SimulationEngine } from './engine';
import { AsyncContext } from './async-context';
import { FaultDriver } from './driver';
import { ProgrammaticPromise, executePromise, createPromiseContext } from './promise';
import { SimulationRun, FaultScheduleTemplate, FaultSchedule, PromiseResult } from '@sibyl-shared';
import { PRNG } from './prng';
import * as crypto from 'crypto';

export interface SearchConfig {
  workflow: () => Promise<void>;
  templates: FaultScheduleTemplate[];
  promises: ProgrammaticPromise[];
  iterations: number;
  concurrency?: number;
  earlyExit?: boolean; // Stop if ANY promise fails
  seed?: string;
  clockOptions?: { mode: 'realtime' | 'accelerated', skewMs?: number };
}

export interface SearchResult {
  totalRuns: number;
  failures: number;
  passes: number;
  worstRun?: {
    runId: string;
    seed: string;
    concreteSchedules: FaultSchedule[];
    promiseResults: PromiseResult[];
  };
  results: {
    runId: string;
    seed: string;
    concreteSchedules: FaultSchedule[];
    promiseResults: PromiseResult[];
    passed: boolean;
  }[];
}

export class SearchOrchestrator {
  private masterSeed: string;
  private prng: PRNG;
  private drivers: FaultDriver[] = [];

  constructor(private config: SearchConfig) {
    this.masterSeed = config.seed || crypto.randomUUID();
    this.prng = new PRNG(this.masterSeed);
  }

  registerDriver(driver: FaultDriver) {
    this.drivers.push(driver);
  }

  private generateConcreteSchedules(runSeed: string): FaultSchedule[] {
    const runPrng = new PRNG(runSeed);
    return this.config.templates.map(t => {
      const prob = t.probabilityRange 
        ? runPrng.next() * (t.probabilityRange[1] - t.probabilityRange[0]) + t.probabilityRange[0]
        : 1;

      const spec = { ...t.spec };
      if (t.delayMsRange) {
        spec.delayMs = Math.floor(runPrng.next() * (t.delayMsRange[1] - t.delayMsRange[0])) + t.delayMsRange[0];
      }

      return {
        id: crypto.randomUUID(),
        spec,
        probability: prob,
        target: t.target
      } as FaultSchedule;
    });
  }

  async run(): Promise<SearchResult> {
    const results: SearchResult['results'] = [];
    let earlyExited = false;
    let worstRun: SearchResult['worstRun'] | undefined;

    const concurrency = this.config.concurrency || 1;
    let iterationsDone = 0;

    // We must install drivers ONCE in the process, but we install them with an AsyncContext-aware proxy context.
    this.installContextAwareDrivers();

    const workerQueue = Array.from({ length: this.config.iterations }, (_, i) => i);

    const worker = async () => {
      while (workerQueue.length > 0 && !earlyExited) {
        const i = workerQueue.shift()!;
        const runSeed = this.prng.fork(`run-${i}`).next().toString();
        const schedules = this.generateConcreteSchedules(runSeed);
        
        const runId = crypto.randomUUID();
        const runConfig: SimulationRun = {
          id: runId,
          environment: 'LOCAL_PROCESS',
          status: 'PENDING',
          schedules
        };

        const engine = new SimulationEngine(runConfig, runSeed, this.config.clockOptions);
        // Do not call engine.installDriver() since we proxy at the global level
        
        await AsyncContext.run({ runId, engine }, async () => {
          engine.start();
          try {
            await this.config.workflow();
          } catch (e) {
            console.error(`Workflow crashed in run ${runId}`, e);
          }
          engine.stop();
        });

        // Evaluate promises outside of AsyncContext
        const pCtx = createPromiseContext(runId, engine.getEvents());
        const promiseResults: PromiseResult[] = [];
        let runPassed = true;

        for (const p of this.config.promises) {
          const res = await executePromise(p, pCtx, Date.now());
          promiseResults.push(res);
          if (!res.passed) {
            runPassed = false;
          }
        }

        const runRecord = {
          runId,
          seed: runSeed,
          concreteSchedules: schedules,
          promiseResults,
          passed: runPassed
        };

        results.push(runRecord);

        if (!runPassed) {
          if (!worstRun || promiseResults.filter(p => !p.passed).length > worstRun.promiseResults.filter(p => !p.passed).length) {
            worstRun = runRecord;
          }
          if (this.config.earlyExit) {
            earlyExited = true;
          }
        }

        iterationsDone++;
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    this.uninstallDrivers();

    return {
      totalRuns: iterationsDone,
      failures: results.filter(r => !r.passed).length,
      passes: results.filter(r => r.passed).length,
      worstRun,
      results
    };
  }

  /**
   * Installs the drivers globally once, but provides a Proxy context that looks up the active engine via AsyncLocalStorage.
   */
  private installContextAwareDrivers() {
    for (const driver of this.drivers) {
      driver.install({
        get clock() {
          const engine = AsyncContext.getEngine();
          if (!engine) throw new Error(`No active SimulationEngine found in AsyncLocalStorage for driver ${driver.domain}`);
          return (engine as any).clock;
        },
        getFaultDecision: (domain, meta) => {
          const engine = AsyncContext.getEngine();
          if (!engine) return null; // Or throw? If it's a background call outside a workflow context, it shouldn't be faulted.
          // In engine.ts we need to expose getFaultDecision. 
          // Let's call engine.evaluateFaultDecision(domain, meta)
          return (engine as any).evaluateFaultDecision(domain, meta);
        },
        recordEvent: (event) => {
          const engine = AsyncContext.getEngine();
          if (engine) {
             (engine as any).recordEvent(event);
          }
        }
      });
    }
  }

  private uninstallDrivers() {
    for (const driver of this.drivers) {
      driver.uninstall();
    }
  }
}
