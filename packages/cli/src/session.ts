import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import {
  SearchOrchestrator,
  Ucb1SearchStrategy,
  MctsSearchStrategy,
  BayesianSearchStrategy,
  nativeNow,
  type SearchStrategy,
  type SearchResult,
  type RunRecord,
  type StrategyName,
  type EngineClockOptions,
} from '@sibyl/core';
import type { Session, CreateSessionRequest } from '@sibyl/shared';
import { LoadedConfig, resolveDrivers } from './config';

export interface RunOptions {
  iterations?: number;
  concurrency?: number;
  seed?: string;
  strategy?: StrategyName;
  clock?: EngineClockOptions['mode'];
  earlyExit?: boolean;
  runTimeoutMs?: number;
  updateSnapshots?: boolean;
  source: 'cli' | 'ci';
  onRun?: (run: RunRecord, progress: { done: number; total: number; failures: number }, sessionId: string) => void;
}

export const STRATEGIES: StrategyName[] = ['ucb1', 'mcts', 'bayesian'];

export function createStrategy(name: StrategyName, loaded: LoadedConfig, seed: string): SearchStrategy {
  const templates = loaded.config.templates;
  switch (name) {
    case 'ucb1': return new Ucb1SearchStrategy(templates, seed);
    case 'mcts': return new MctsSearchStrategy(templates, seed);
    case 'bayesian': return new BayesianSearchStrategy(templates, seed);
    default: throw new Error(`Unknown strategy "${name}". Expected one of: ${STRATEGIES.join(', ')}`);
  }
}

function gitInfo(cwd: string): { commit?: string; branch?: string } | undefined {
  const git = (args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    return { commit: git(['rev-parse', 'HEAD']), branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) };
  } catch {
    return undefined; // not a repository, or git is not installed
  }
}

function buildOrchestrator(loaded: LoadedConfig, options: Partial<RunOptions> & { seed: string; sessionId?: string }) {
  const { config } = loaded;
  const strategyName = options.strategy ?? config.strategy ?? 'ucb1';
  const clockMode = options.clock ?? config.clock?.mode;
  return {
    strategyName,
    orchestrator: new SearchOrchestrator({
      workflow: config.workflow,
      templates: config.templates,
      promises: config.promises,
      iterations: options.iterations ?? config.iterations ?? 100,
      concurrency: options.concurrency ?? config.concurrency ?? 1,
      seed: options.seed,
      strategy: createStrategy(strategyName, loaded, options.seed),
      clockOptions: clockMode ? { ...config.clock, mode: clockMode } : config.clock,
      earlyExit: options.earlyExit ?? config.earlyExit,
      runTimeoutMs: options.runTimeoutMs ?? config.runTimeoutMs,
      flakeRetries: config.flakeRetries,
      updateSnapshots: options.updateSnapshots,
      runIdNamespace: options.sessionId,
      onRunComplete: (run, progress) => options.onRun?.(run, progress, options.sessionId ?? ''),
    }),
  };
}

/** Runs one search session end to end and returns it in the shape the API stores. */
export async function runSession(loaded: LoadedConfig, options: RunOptions): Promise<{ session: Session; result: SearchResult }> {
  const { config } = loaded;
  const sessionId = crypto.randomUUID();
  // An unseeded session still gets a concrete seed, recorded, so any run in it can be replayed.
  const seed = options.seed ?? config.seed ?? crypto.randomBytes(4).toString('hex');
  const { orchestrator, strategyName } = buildOrchestrator(loaded, { ...options, seed, sessionId });
  for (const driver of await resolveDrivers(config)) orchestrator.registerDriver(driver);

  const startedAt = nativeNow();
  await config.setup?.();
  let result: SearchResult;
  try {
    result = await orchestrator.run();
  } finally {
    await config.teardown?.();
  }
  const completedAt = nativeNow();

  const payload: CreateSessionRequest = {
    id: sessionId,
    project: loaded.project,
    seed,
    strategy: strategyName,
    iterations: options.iterations ?? config.iterations ?? 100,
    startedAt,
    completedAt,
    summary: {
      totalRuns: result.totalRuns,
      failures: result.failures,
      passes: result.passes,
      errored: result.errored,
      intermittent: result.intermittent,
    },
    promises: config.promises.map(p => ({ id: p.id, description: p.description ?? '', severity: p.severity ?? 'CRITICAL', scope: p.scope })),
    sessionPromiseResults: result.sessionPromiseResults,
    runs: result.results,
    source: options.source,
    git: gitInfo(loaded.path.replace(/[\\/][^\\/]*$/, '')),
  };

  return { session: { ...payload, id: sessionId, createdAt: completedAt }, result };
}

/**
 * Replays one stored run against the current config: same seed, same concrete schedules. Reports
 * whether the outcome and the sequence of fault decisions matched the original.
 */
export async function replayRun(loaded: LoadedConfig, stored: { seed: string; runId: string; concreteSchedules: any[]; status: string; events?: any[] }) {
  const { orchestrator } = buildOrchestrator(loaded, { seed: stored.seed, iterations: 1 });
  for (const driver of await resolveDrivers(loaded.config)) orchestrator.registerDriver(driver);

  await loaded.config.setup?.();
  let replayed: RunRecord;
  try {
    replayed = await orchestrator.replay(stored);
  } finally {
    await loaded.config.teardown?.();
  }

  // Timestamps are wall-clock under a real-time clock, so compare what was decided, not when.
  const shape = (events?: any[]) => (events ?? []).map(e => JSON.stringify({ domain: e.domain, payload: e.payload }));
  const originalEvents = stored.events;
  const timelineMatches = originalEvents === undefined ? null : JSON.stringify(shape(originalEvents)) === JSON.stringify(shape(replayed.events));

  return {
    replayed,
    statusMatches: replayed.status === stored.status,
    /** null when the original was a passing run, whose timeline is not stored. */
    timelineMatches,
  };
}
