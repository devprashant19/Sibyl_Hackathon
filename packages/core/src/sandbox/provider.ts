export interface SandboxConfig {
  imageId: string;
  env?: Record<string, string>;
  maxMemoryMb?: number;
  maxCpus?: number;
}

export interface Sandbox {
  readonly id: string;

  /**
   * Starts the sandbox and executes the command.
   */
  start(command: string[]): Promise<void>;

  /**
   * Gracefully stops the sandbox.
   */
  stop(): Promise<void>;

  /**
   * Force kills and cleans up the sandbox resources.
   */
  cleanup(): Promise<void>;

  /**
   * Executes a resource pressure fault inside the sandbox boundaries.
   * @param type CPU or MEMORY
   * @param intensityPct 1 to 100 percentage of the sandbox's total capacity to consume.
   */
  executePressureFault(type: 'CPU' | 'MEMORY', intensityPct: number): Promise<void>;

  /**
   * Triggers a hard crash of the main process inside the sandbox.
   */
  executeCrashFault(): Promise<void>;
}

export interface SandboxProvider {
  createSandbox(config: SandboxConfig): Promise<Sandbox>;
}
