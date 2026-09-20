import { FaultSchedule, PromiseResult } from '@sibyl-shared';

export interface SearchRunRecord {
  runId: string;
  seed: string;
  concreteSchedules: FaultSchedule[];
  promiseResults: PromiseResult[];
  passed: boolean;
}

export interface SearchStrategy {
  /**
   * Called before a run starts. Returns the concrete schedules to use.
   * Driven strictly by the internal strategy PRNG.
   */
  next(iterationIndex: number): FaultSchedule[];
  
  /**
   * Called after a run completes to update internal knowledge (UCB1 weights, shrinking logic).
   */
  feedback(runResult: SearchRunRecord): void;
}
