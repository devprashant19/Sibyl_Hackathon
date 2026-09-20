import { SimulationEngine } from './engine';
import { AsyncContext } from './async-context';
import { FaultDriver } from './driver';
import { ProgrammaticPromise, executePromise, createPromiseContext } from './promise';
import { SimulationRun, FaultScheduleTemplate, FaultSchedule, PromiseResult, FaultScheduleSchema } from '@sibyl-shared';
import { z } from 'zod';
import { PRNG } from './prng';
import * as crypto from 'crypto';

import { SearchStrategy, SearchRunRecord } from './search/strategy';
import { Ucb1SearchStrategy } from './search/ucb1';
import { SandboxProvider, Sandbox } from './sandbox/provider';

export interface SearchConfig {
  workflow: () => Promise<void>;
  templates: FaultScheduleTemplate[];
  promises: ProgrammaticPromise[];
  iterations: number;
  concurrency?: number;
  earlyExit?: boolean; // Stop if ANY promise fails
  seed?: string;
  clockOptions?: { mode: 'realtime' | 'accelerated', skewMs?: number };
  strategy?: SearchStrategy;
  sandboxProvider?: SandboxProvider;
  updateSnapshots?: boolean;
}

export interface SearchResult {
  totalRuns: number;
  failures: number;
  passes: number;
  errored: number;
  worstRun?: {
    runId: string;
    seed: string;
    concreteSchedules: FaultSchedule[];
    promiseResults: PromiseResult[];
    status: SimulationRun['status'];
    error?: string;
  };
  results: {
    runId: string;
    seed: string;
    concreteSchedules: FaultSchedule[];
    promiseResults: PromiseResult[];
    passed: boolean;
    status: SimulationRun['status'];
    error?: string;
  }[];
  sessionPromiseResults?: PromiseResult[];
}

export class SearchOrchestrator {
  private masterSeed: string;
  private prng: PRNG;
  private drivers: FaultDriver[] = [];
  private strategy: SearchStrategy;
  
  // State for pausing/resuming
  private iterationsDone = 0;
  private attemptCounter = 0;
  private results: SearchResult['results'] = [];
  private worstRun: SearchResult['worstRun'] | undefined;
  private earlyExited = false;
  
  // Deduplication state
  private seenFingerprints: Map<string, SearchRunRecord> = new Map();

  constructor(private config: SearchConfig) {
    this.masterSeed = config.seed || crypto.randomUUID();
    this.prng = new PRNG(this.masterSeed);
    this.strategy = config.strategy || new Ucb1SearchStrategy(config.templates, this.masterSeed);
  }

  registerDriver(driver: FaultDriver) {
    this.drivers.push(driver);
  }

  exportState(): any {
    return {
      masterSeed: this.masterSeed,
      iterationsDone: this.iterationsDone,
      attemptCounter: this.attemptCounter,
      results: this.results,
      worstRun: this.worstRun,
      earlyExited: this.earlyExited,
      prng: this.prng.exportState(),
      strategy: this.strategy.exportState ? this.strategy.exportState() : null,
      seenFingerprints: Array.from(this.seenFingerprints.entries())
    };
  }

  importState(state: any): void {
    if (!state) return;
    this.masterSeed = state.masterSeed;
    this.iterationsDone = state.iterationsDone;
    this.attemptCounter = state.attemptCounter;
    this.results = state.results || [];
    this.worstRun = state.worstRun;
    this.earlyExited = state.earlyExited;
    if (state.prng) this.prng.importState(state.prng);
    if (state.strategy && this.strategy.importState) {
      this.strategy.importState(state.strategy);
    }
    if (state.seenFingerprints) {
      this.seenFingerprints = new Map(state.seenFingerprints);
    }
  }

  static resume(state: any, config: SearchConfig): SearchOrchestrator {
    const orchestrator = new SearchOrchestrator(config);
    orchestrator.importState(state);
    return orchestrator;
  }

  private computeFingerprint(runSeed: string, schedules: FaultSchedule[]): string {
    const parts: string[] = [];
    for (const sched of schedules) {
      const rng = new PRNG(runSeed).fork(sched.spec.domain);
      let decisions = '';
      for (let i = 0; i < 50; i++) {
        decisions += (rng.next() <= sched.probability) ? '1' : '0';
      }
      const specHash = crypto.createHash('md5').update(JSON.stringify(sched.spec)).digest('hex');
      parts.push(`${sched.spec.domain}:${sched.probability}:${specHash}:${decisions}`);
    }
    return crypto.createHash('md5').update(parts.join('|')).digest('hex');
  }

  async run(): Promise<SearchResult> {
    const concurrency = this.config.concurrency || 1;
    this.installContextAwareDrivers();

    const worker = async () => {
      let consecutiveDuplicates = 0;
      while (this.iterationsDone < this.config.iterations && !this.earlyExited) {
        if (consecutiveDuplicates >= 50) {
          console.warn(`SearchOrchestrator: Reached ${consecutiveDuplicates} consecutive duplicate schedules. State space might be exhausted. Stopping early.`);
          break;
        }

        let schedules: FaultSchedule[] = [];
        let runStatus: SimulationRun['status'] = 'PENDING';
        let runError: string | undefined;

        try {
          const rawSchedules = this.strategy.next(this.iterationsDone);
          schedules = z.array(FaultScheduleSchema).parse(rawSchedules);
        } catch (e: any) {
          runStatus = 'ERRORED';
          runError = `Malformed FaultSchedule generated by strategy: ${e.message}`;
          console.error(runError);
        }
        
        const runSeed = this.prng.fork(`run-${this.attemptCounter}`).next().toString();
        this.attemptCounter++;

        let fingerprint = '';
        if (runStatus !== 'ERRORED') {
          fingerprint = this.computeFingerprint(runSeed, schedules);
          if (this.seenFingerprints.has(fingerprint)) {
            consecutiveDuplicates++;
            const cachedRecord = this.seenFingerprints.get(fingerprint)!;
            const duplicateRecord: SearchRunRecord = {
              ...cachedRecord,
              runId: crypto.randomUUID(),
              seed: runSeed
            };
            this.strategy.feedback(duplicateRecord);
            continue; // Go to next loop iteration without consuming budget
          }
        }
        
        consecutiveDuplicates = 0;

        const runId = crypto.randomUUID();
        let runPassed = false;
        let finalPromiseResults: PromiseResult[] = [];
        
        if (runStatus === 'ERRORED') {
          const erroredRecord = {
             runId, seed: runSeed, concreteSchedules: schedules, promiseResults: [], passed: false, status: 'ERRORED' as const, error: runError
          };
          this.results.push(erroredRecord);
          this.strategy.feedback(erroredRecord);
          this.iterationsDone++;
          continue;
        }

        // --- Flake Confirmation loop (Retry up to 3 times) ---
        for (let attempt = 0; attempt < 3; attempt++) {
          const runConfig: SimulationRun = {
            id: runId,
            environment: this.config.sandboxProvider ? 'DOCKER_CONTAINER' : 'LOCAL_PROCESS',
            status: 'PENDING',
            schedules
          };
          const engine = new SimulationEngine(runConfig, runSeed, this.config.clockOptions);
          
          let sandbox: Sandbox | undefined;
          if (this.config.sandboxProvider) {
            sandbox = await this.config.sandboxProvider.createSandbox({
              imageId: 'sibyl-default-sandbox:latest',
              maxMemoryMb: 512, maxCpus: 1
            });
          }

          let iterStatus: SimulationRun['status'] = 'RUNNING';
          let iterError: string | undefined;

          await AsyncContext.run({ runId, engine }, async () => {
            engine.start();
            try {
              if (sandbox) {
                await sandbox.start(['node', 'dist/sandbox-worker.js']);
                await sandbox.stop();
                await sandbox.cleanup();
              } else {
                await this.config.workflow();
              }
              iterStatus = 'COMPLETED';
            } catch (e: any) {
              console.error(`Workflow crashed in run ${runId} (attempt ${attempt})`, e);
              iterStatus = 'ERRORED';
              iterError = `Workflow threw synchronously or crashed: ${e.message}`;
            }
            engine.stop();
          });

          const pCtx = createPromiseContext(runId, engine.getEvents(), this.config.updateSnapshots);
          const promiseResults: PromiseResult[] = [];
          let iterPassed = iterStatus === 'COMPLETED';

          const runPromises = this.config.promises.filter(p => p.scope !== 'session');

          if (iterStatus === 'COMPLETED' || iterStatus === 'ERRORED') {
            for (const p of runPromises) {
              const res = await executePromise(p, pCtx, Date.now());
              promiseResults.push(res);
              if (!res.passed) {
                iterPassed = false;
              }
            }
          }

          if (iterStatus === 'COMPLETED' && !iterPassed) {
            iterStatus = 'FAILED';
          }

          if (iterPassed) {
            if (attempt > 0) {
              // It failed before, but passed now! It's an intermittent flake.
              finalPromiseResults.forEach(pr => {
                if (!pr.passed) pr.intermittent = true;
              });
              runPassed = false;
              runStatus = 'INTERMITTENT';
            } else {
              runPassed = true;
              runStatus = 'COMPLETED';
              finalPromiseResults = promiseResults;
            }
            break; // Stop retrying
          } else {
            // Failed on this attempt
            finalPromiseResults = promiseResults;
            runPassed = false;
            runStatus = iterStatus;
            runError = iterError;
            
            if (iterStatus === 'ERRORED') {
              // Crash - do not retry
              break;
            }
          }
        }

        const runRecord: SearchRunRecord & { status: SimulationRun['status'], error?: string } = {
          runId,
          seed: runSeed,
          concreteSchedules: schedules,
          promiseResults: finalPromiseResults,
          passed: runPassed,
          status: runStatus,
          error: runError
        };

        this.seenFingerprints.set(fingerprint, runRecord);
        this.strategy.feedback(runRecord);
        this.results.push(runRecord);

        if (!runPassed) {
          if (!this.worstRun || finalPromiseResults.filter(p => !p.passed).length > this.worstRun.promiseResults.filter(p => !p.passed).length) {
            this.worstRun = runRecord;
          }
          if (this.config.earlyExit) {
            this.earlyExited = true;
          }
        }

        this.iterationsDone++;
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    this.uninstallDrivers();

    const sessionPromises = this.config.promises.filter(p => p.scope === 'session');
    const sessionPromiseResults: PromiseResult[] = [];
    
    if (sessionPromises.length > 0) {
      const sessionCtx = { runs: this.results, updateSnapshots: this.config.updateSnapshots };
      for (const p of sessionPromises) {
        const res = await executePromise(p, sessionCtx as any, Date.now());
        sessionPromiseResults.push(res);
      }
    }

    return {
      totalRuns: this.iterationsDone,
      failures: this.results.filter(r => r.status === 'FAILED').length + sessionPromiseResults.filter(r => !r.passed).length,
      passes: this.results.filter(r => r.passed).length,
      errored: this.results.filter(r => r.status === 'ERRORED').length,
      worstRun: this.worstRun,
      results: this.results,
      sessionPromiseResults
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
          if (!engine) return null;
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
