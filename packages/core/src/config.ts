import type { FaultScheduleTemplate } from '@sibyl/shared';
import type { FaultDriver } from './driver';
import type { ProgrammaticPromise } from './promise';
import type { EngineClockOptions } from './engine';

export type StrategyName = 'ucb1' | 'mcts' | 'bayesian';

/**
 * The shape of a `sibyl.config.ts`. Everything the CLI needs to run a search: the workflow under
 * test, the faults it may inject, the promises that must hold, and the drivers that intercept I/O.
 * Command-line flags override the numeric settings.
 */
export interface SibylConfig {
  /** Groups sessions on the dashboard. Defaults to the config file's directory name. */
  project?: string;
  /** One execution of the system under test. Throwing marks the run ERRORED. */
  workflow: () => Promise<void> | void;
  templates: FaultScheduleTemplate[];
  promises: ProgrammaticPromise[];
  /**
   * Fault drivers to install for the session. `'http'` installs the bundled HTTP driver (global
   * fetch and http.request). Drivers that wrap a client object (database pools, Kafka, fs, child
   * processes) are constructed in your own code and passed here as instances.
   */
  drivers?: Array<'http' | FaultDriver>;
  iterations?: number;
  concurrency?: number;
  seed?: string;
  strategy?: StrategyName;
  clock?: EngineClockOptions;
  runTimeoutMs?: number;
  flakeRetries?: number;
  earlyExit?: boolean;
  /** Called once before the session starts and once after it ends, e.g. to start a test server. */
  setup?: () => Promise<void> | void;
  teardown?: () => Promise<void> | void;
}

/** Identity helper that gives a config file type checking and autocompletion. */
export function defineConfig(config: SibylConfig): SibylConfig {
  return config;
}
