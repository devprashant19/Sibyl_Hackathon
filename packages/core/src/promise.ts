import { CapturedEvent, PromiseResult, PromiseSeverity } from '@sibyl-shared';

export interface PromiseContext {
  runId: string;
  events: CapturedEvent[];
  /**
   * Returns captured events sorted chronologically by virtual time.
   * Optionally filtered by a predicate.
   */
  timeline(filterFn?: (event: CapturedEvent) => boolean): CapturedEvent[];
}

export type EvaluationResult = Omit<PromiseResult, 'promiseId' | 'simulationRunId' | 'evaluatedAt' | 'severity'> & { severity?: PromiseSeverity };

export interface ProgrammaticPromise {
  id: string;
  description: string;
  severity: PromiseSeverity;
  evaluate(ctx: PromiseContext): EvaluationResult | boolean | Promise<EvaluationResult | boolean>;
}

export function createPromiseContext(runId: string, events: CapturedEvent[]): PromiseContext {
  return {
    runId,
    events,
    timeline(filterFn?: (event: CapturedEvent) => boolean) {
      const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
      return filterFn ? sorted.filter(filterFn) : sorted;
    }
  };
}

export async function executePromise(promise: ProgrammaticPromise, ctx: PromiseContext, timestamp: number): Promise<PromiseResult> {
  const res = await promise.evaluate(ctx);
  const isBool = typeof res === 'boolean';
  
  return {
    promiseId: promise.id,
    simulationRunId: ctx.runId,
    passed: isBool ? res : res.passed,
    severity: isBool ? promise.severity : (res.severity || promise.severity),
    message: isBool ? undefined : res.message,
    actualValue: isBool ? undefined : res.actualValue,
    evaluatedAt: timestamp
  };
}

export function allOf(
  id: string,
  description: string,
  promises: ProgrammaticPromise[],
  severity: PromiseSeverity = 'CRITICAL'
): ProgrammaticPromise {
  return {
    id,
    description,
    severity,
    async evaluate(ctx: PromiseContext) {
      const results = [];
      for (const p of promises) {
        const res = await p.evaluate(ctx);
        results.push({ promise: p, res });
      }
      
      const failed = results.filter(r => typeof r.res === 'boolean' ? !r.res : !r.res.passed);
      
      if (failed.length > 0) {
        return {
          passed: false,
          message: `allOf failed: [${failed.map(f => f.promise.id).join(', ')}] failed.`
        };
      }
      
      return { passed: true, message: 'All sub-promises passed.' };
    }
  };
}

export function anyOf(
  id: string,
  description: string,
  promises: ProgrammaticPromise[],
  severity: PromiseSeverity = 'CRITICAL'
): ProgrammaticPromise {
  return {
    id,
    description,
    severity,
    async evaluate(ctx: PromiseContext) {
      for (const p of promises) {
        const res = await p.evaluate(ctx);
        const passed = typeof res === 'boolean' ? res : res.passed;
        if (passed) {
          return { passed: true, message: `anyOf passed because [${p.id}] passed.` };
        }
      }
      return { passed: false, message: 'anyOf failed: All sub-promises failed.' };
    }
  };
}
