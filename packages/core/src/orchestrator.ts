import { SimulationEngine, EngineClockOptions, rollHits } from './engine';
import { AsyncContext } from './async-context';
import { FaultDriver } from './driver';
import { ProgrammaticPromise, executePromise, createPromiseContext } from './promise';
import { SimulationRun, FaultScheduleTemplate, FaultSchedule, PromiseResult, FaultScheduleSchema, CapturedEvent } from '@sibyl/shared';
import { z } from 'zod';
import { PRNG } from './prng';
import { VirtualClock, nativeNow, nativeSetTimeout, nativeClearTimeout } from './clock';
import * as crypto from 'crypto';

import { SearchStrategy, SearchRunRecord } from './search/strategy';
import { Ucb1SearchStrategy } from './search/ucb1';
import { SandboxProvider, Sandbox } from './sandbox/provider';

export interface SearchConfig {
  workflow: () => Promise<void> | void;
  templates: FaultScheduleTemplate[];
  promises: ProgrammaticPromise[];
  iterations: number;
  concurrency?: number;
  earlyExit?: boolean; // Stop if ANY promise fails
  seed?: string;
  clockOptions?: EngineClockOptions;
  strategy?: SearchStrategy;
  sandboxProvider?: SandboxProvider;
  updateSnapshots?: boolean;
  /** Wall-clock limit for one execution of the workflow. A run that exceeds it is ERRORED. Default 30s. */
  runTimeoutMs?: number;
  /** Extra attempts given to a failing run to tell a real failure from a flake. Default 2. */
  flakeRetries?: number;
  /**
   * Mixed into run ids. Run ids are drawn from the seed so a session is reproducible; two sessions
   * that share a seed but not a config would otherwise hand out the same ids. The CLI passes the
   * session id.
   */
  runIdNamespace?: string;
  /** Called after every counted run, in completion order. */
  onRunComplete?: (run: RunRecord, progress: { done: number; total: number; failures: number }) => void;
}

export type RunStatus = SimulationRun['status'];

export interface RunRecord {
  runId: string;
  seed: string;
  concreteSchedules: FaultSchedule[];
  promiseResults: PromiseResult[];
  passed: boolean;
  status: RunStatus;
  error?: string;
  durationMs?: number;
  eventCount?: number;
  /** Captured timeline. Kept only for runs that did not pass, which are the ones worth replaying. */
  events?: CapturedEvent[];
}

export interface SearchResult {
  seed: string;
  totalRuns: number;
  failures: number;
  passes: number;
  errored: number;
  intermittent: number;
  worstRun?: RunRecord;
  results: RunRecord[];
  sessionPromiseResults?: PromiseResult[];
}

interface ExecutionOutcome {
  status: RunStatus;
  passed: boolean;
  promiseResults: PromiseResult[];
  events: CapturedEvent[];
  error?: string;
  durationMs: number;
}

const DEFAULT_RUN_TIMEOUT_MS = 30_000;

export class SearchOrchestrator {
  private masterSeed: string;
  private prng: PRNG;
  private drivers: FaultDriver[] = [];
  private strategy: SearchStrategy;

  // State for pausing/resuming
  private iterationsDone = 0;
  private iterationsClaimed = 0;
  private attemptCounter = 0;
  private results: RunRecord[] = [];
  private worstRun: RunRecord | undefined;
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

  getSeed(): string {
    return this.masterSeed;
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
    this.iterationsClaimed = state.iterationsDone;
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
        decisions += rollHits(rng.next(), sched.probability) ? '1' : '0';
      }
      const specHash = crypto.createHash('md5').update(JSON.stringify(sched.spec)).digest('hex');
      parts.push(`${sched.spec.domain}:${sched.probability}:${specHash}:${decisions}`);
    }
    return crypto.createHash('md5').update(parts.join('|')).digest('hex');
  }

  async run(): Promise<SearchResult> {
    const concurrency = Math.max(1, this.config.concurrency || 1);
    this.iterationsClaimed = this.iterationsDone;
    this.installContextAwareDrivers();

    const worker = async () => {
      let consecutiveDuplicates = 0;
      // Claim an iteration slot before starting it. Checking iterationsDone alone let every
      // concurrent worker pass the check before any of them finished, overshooting the budget.
      while (this.iterationsClaimed < this.config.iterations && !this.earlyExited) {
        if (consecutiveDuplicates >= 50) {
          console.warn(`SearchOrchestrator: Reached ${consecutiveDuplicates} consecutive duplicate schedules. State space might be exhausted. Stopping early.`);
          break;
        }
        const iterationIndex = this.iterationsClaimed++;

        let schedules: FaultSchedule[] = [];
        let malformedError: string | undefined;
        try {
          const rawSchedules = this.strategy.next(iterationIndex);
          schedules = z.array(FaultScheduleSchema).parse(rawSchedules);
        } catch (e: any) {
          malformedError = `Malformed FaultSchedule generated by strategy: ${e.message}`;
          console.error(malformedError);
        }

        const attempt = this.attemptCounter++;
        const runSeed = this.prng.fork(`run-${attempt}`).next().toString();
        const ns = this.config.runIdNamespace ? `${this.config.runIdNamespace}:` : '';
        const runId = this.prng.fork(`run-id-${ns}${attempt}`).uuid();

        if (malformedError) {
          const erroredRecord: RunRecord = {
            runId, seed: runSeed, concreteSchedules: schedules, promiseResults: [], passed: false, status: 'ERRORED', error: malformedError
          };
          this.recordRun(erroredRecord);
          continue;
        }

        const fingerprint = this.computeFingerprint(runSeed, schedules);
        const cachedRecord = this.seenFingerprints.get(fingerprint);
        if (cachedRecord) {
          consecutiveDuplicates++;
          this.iterationsClaimed--; // A duplicate does not consume budget
          // Report the known outcome against the schedules just issued, so the strategy can match
          // them to its own bookkeeping.
          this.strategy.feedback({ ...cachedRecord, runId, seed: runSeed, concreteSchedules: schedules });
          continue;
        }
        consecutiveDuplicates = 0;

        const retries = Math.max(0, this.config.flakeRetries ?? 2);
        let outcome = await this.executeRun(runId, runSeed, schedules);
        if (!outcome.passed && outcome.status !== 'ERRORED') {
          // Flake confirmation: the same seed and schedule again. A deterministic failure fails
          // every time; one that passes on a retry is reported as INTERMITTENT, not as a pass.
          for (let r = 0; r < retries; r++) {
            const retry = await this.executeRun(runId, runSeed, schedules);
            if (retry.passed) {
              outcome.promiseResults.forEach(pr => { if (!pr.passed) pr.intermittent = true; });
              outcome = { ...outcome, status: 'INTERMITTENT' };
              break;
            }
            if (retry.status === 'ERRORED') {
              outcome = retry;
              break;
            }
          }
        }

        const runRecord: RunRecord = {
          runId,
          seed: runSeed,
          concreteSchedules: schedules,
          promiseResults: outcome.promiseResults,
          passed: outcome.passed,
          status: outcome.status,
          error: outcome.error,
          durationMs: outcome.durationMs,
          eventCount: outcome.events.length,
          events: outcome.passed ? undefined : outcome.events,
        };

        this.seenFingerprints.set(fingerprint, runRecord);
        this.recordRun(runRecord);
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    } finally {
      this.uninstallDrivers();
    }

    const sessionPromises = this.config.promises.filter(p => p.scope === 'session');
    const sessionPromiseResults: PromiseResult[] = [];

    if (sessionPromises.length > 0) {
      const sessionCtx = { runs: this.results, updateSnapshots: this.config.updateSnapshots };
      for (const p of sessionPromises) {
        const res = await executePromise(p, sessionCtx as any, nativeNow());
        sessionPromiseResults.push(res);
      }
    }

    return {
      seed: this.masterSeed,
      totalRuns: this.iterationsDone,
      failures: this.results.filter(r => r.status === 'FAILED').length + sessionPromiseResults.filter(r => !r.passed).length,
      passes: this.results.filter(r => r.passed).length,
      errored: this.results.filter(r => r.status === 'ERRORED').length,
      intermittent: this.results.filter(r => r.status === 'INTERMITTENT').length,
      worstRun: this.worstRun,
      results: this.results,
      sessionPromiseResults
    };
  }

  /**
   * Re-executes one run exactly: same seed, same concrete schedules, no strategy, no deduplication,
   * no flake retries. Because every fault decision comes from the seed, a deterministic workflow
   * reproduces the original outcome and event timeline.
   */
  async replay(run: Pick<RunRecord, 'runId' | 'seed' | 'concreteSchedules'>): Promise<RunRecord> {
    const schedules = z.array(FaultScheduleSchema).parse(run.concreteSchedules);
    this.installContextAwareDrivers();
    let outcome: ExecutionOutcome;
    try {
      outcome = await this.executeRun(run.runId, run.seed, schedules);
    } finally {
      this.uninstallDrivers();
    }
    return {
      runId: run.runId,
      seed: run.seed,
      concreteSchedules: schedules,
      promiseResults: outcome.promiseResults,
      passed: outcome.passed,
      status: outcome.status,
      error: outcome.error,
      durationMs: outcome.durationMs,
      eventCount: outcome.events.length,
      events: outcome.events,
    };
  }

  private recordRun(record: RunRecord) {
    this.strategy.feedback(record);
    this.results.push(record);
    this.iterationsDone++;

    if (!record.passed) {
      const failedCount = (r: RunRecord) => r.promiseResults.filter(p => !p.passed).length;
      if (!this.worstRun || failedCount(record) > failedCount(this.worstRun)) {
        this.worstRun = record;
      }
      if (this.config.earlyExit) {
        this.earlyExited = true;
      }
    }

    this.config.onRunComplete?.(record, {
      done: this.iterationsDone,
      total: this.config.iterations,
      failures: this.results.filter(r => r.status === 'FAILED').length,
    });
  }

  private async executeRun(runId: string, runSeed: string, schedules: FaultSchedule[]): Promise<ExecutionOutcome> {
    const runConfig: SimulationRun = {
      id: runId,
      environment: this.config.sandboxProvider ? 'DOCKER_CONTAINER' : 'LOCAL_PROCESS',
      status: 'PENDING',
      schedules
    };
    const engine = new SimulationEngine(runConfig, runSeed, this.config.clockOptions);
    const timeoutMs = this.config.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
    const startedAt = nativeNow();

    let status = 'RUNNING' as RunStatus; // widened: assigned inside the async context below
    let error: string | undefined;

    await AsyncContext.run({ runId, engine }, async () => {
      let sandbox: Sandbox | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      engine.start();
      try {
        const execution = (async () => {
          if (this.config.sandboxProvider) {
            sandbox = await this.config.sandboxProvider.createSandbox({
              imageId: 'sibyl-default-sandbox:latest',
              maxMemoryMb: 512, maxCpus: 1
            });
            await sandbox.start(['node', 'dist/sandbox-worker.js']);
          } else {
            await this.config.workflow();
          }
        })();
        const timeout = new Promise<never>((_, reject) => {
          // A native timer: under an accelerated clock the patched setTimeout would fire instantly.
          timer = nativeSetTimeout(() => reject(new Error(`Run exceeded runTimeoutMs (${timeoutMs}ms)`)), timeoutMs);
        });
        await Promise.race([execution, timeout]);
        status = 'COMPLETED';
      } catch (e: any) {
        console.error(`Workflow crashed in run ${runId}`, e);
        status = 'ERRORED';
        error = `Workflow threw synchronously or crashed: ${e?.message ?? String(e)}`;
      } finally {
        if (timer) nativeClearTimeout(timer);
        if (sandbox) {
          // Cleanup must happen on the error path too, or a crashed run leaks its container.
          await sandbox.stop().catch(() => {});
          await sandbox.cleanup().catch(() => {});
        }
        engine.stop();
      }
    });

    const events = engine.getEvents();
    const pCtx = createPromiseContext(runId, events, this.config.updateSnapshots);
    const promiseResults: PromiseResult[] = [];
    let passed = status === 'COMPLETED';

    for (const p of this.config.promises.filter(p => p.scope !== 'session')) {
      const res = await executePromise(p, pCtx, nativeNow());
      promiseResults.push(res);
      if (!res.passed) passed = false;
    }

    if (status === 'COMPLETED' && !passed) status = 'FAILED';

    return { status, passed, promiseResults, events, error, durationMs: nativeNow() - startedAt };
  }

  /**
   * Installs the drivers globally once, but provides a context that looks up the active engine via
   * AsyncLocalStorage, and routes the patched clock globals the same way.
   */
  private installContextAwareDrivers() {
    VirtualClock.setContextResolver(() => AsyncContext.getEngine()?.getClock());
    for (const driver of this.drivers) {
      driver.install({
        get clock() {
          const engine = AsyncContext.getEngine();
          if (!engine) throw new Error(`No active SimulationEngine found in AsyncLocalStorage for driver ${driver.domain}`);
          return engine.getClock();
        },
        get prng() {
          const engine = AsyncContext.getEngine();
          if (!engine) throw new Error(`No active SimulationEngine found in AsyncLocalStorage for driver ${driver.domain}`);
          return engine.getPrng();
        },
        getFaultDecision: (domain, meta) => {
          const engine = AsyncContext.getEngine();
          if (!engine) return null;
          return engine.evaluateFaultDecision(domain, meta);
        },
        recordEvent: (event) => {
          const engine = AsyncContext.getEngine();
          if (engine) {
            engine.recordEvent(event);
          }
        }
      });
    }
  }

  private uninstallDrivers() {
    for (const driver of this.drivers) {
      driver.uninstall();
    }
    VirtualClock.setContextResolver(null);
  }
}
