import { AsyncLocalStorage } from 'async_hooks';
import { SimulationEngine } from './engine';

export interface AsyncRunContext {
  runId: string;
  engine: SimulationEngine;
}

const asyncLocalStorage = new AsyncLocalStorage<AsyncRunContext>();

export class AsyncContext {
  static run<R>(context: AsyncRunContext, callback: () => R): R {
    return asyncLocalStorage.run(context, callback);
  }

  static getEngine(): SimulationEngine | undefined {
    return asyncLocalStorage.getStore()?.engine;
  }

  static getRunId(): string | undefined {
    return asyncLocalStorage.getStore()?.runId;
  }
}
