import { CapturedEvent, PromiseResult, PromiseSeverity, SearchRunRecord } from '@sibyl-shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface PromiseContext {
  runId: string;
  events: CapturedEvent[];
  /**
   * Returns captured events sorted chronologically by virtual time.
   * Optionally filtered by a predicate.
   */
  timeline(filterFn?: (event: CapturedEvent) => boolean): CapturedEvent[];
  updateSnapshots?: boolean;
}

export interface SessionPromiseContext {
  runs: SearchRunRecord[];
  updateSnapshots?: boolean;
}

export type EvaluationResult = Omit<PromiseResult, 'promiseId' | 'simulationRunId' | 'evaluatedAt' | 'severity'> & { severity?: PromiseSeverity };

export interface ProgrammaticPromise {
  id: string;
  description: string;
  severity: PromiseSeverity;
  scope?: 'run' | 'session';
  evaluate(ctx: PromiseContext | SessionPromiseContext): EvaluationResult | boolean | Promise<EvaluationResult | boolean>;
}

export function createPromiseContext(runId: string, events: CapturedEvent[], updateSnapshots?: boolean): PromiseContext {
  return {
    runId,
    events,
    updateSnapshots,
    timeline(filterFn?: (event: CapturedEvent) => boolean) {
      const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
      return filterFn ? sorted.filter(filterFn) : sorted;
    }
  };
}

export async function executePromise(
  promise: ProgrammaticPromise,
  ctx: PromiseContext | SessionPromiseContext,
  timestamp: number
): Promise<PromiseResult> {
  let res: any;
  try {
    res = await promise.evaluate(ctx);
  } catch (e: any) {
    res = {
      passed: false,
      message: `Promise evaluation crashed: ${e.message}`,
      severity: promise.severity
    };
  }

  let isBool = typeof res === 'boolean';
  
  if (!isBool && (res === null || typeof res !== 'object' || typeof res.passed !== 'boolean')) {
    res = {
      passed: false,
      message: `Promise evaluation returned invalid result type: ${JSON.stringify(res)}`,
      severity: promise.severity
    };
    isBool = false;
  }
  
  // Distinguish run vs session contexts
  const isSession = !('runId' in ctx);
  
  return {
    promiseId: promise.id,
    simulationRunId: isSession ? 'SESSION' : (ctx as PromiseContext).runId,
    passed: isBool ? res : res.passed,
    severity: isBool ? promise.severity : (res.severity || promise.severity),
    message: isBool ? undefined : res.message,
    actualValue: isBool ? undefined : res.actualValue,
    evaluatedAt: timestamp
  };
}

export function snapshotPromise(
  id: string,
  description: string,
  extractEvidence: (ctx: PromiseContext | SessionPromiseContext) => any,
  severity: PromiseSeverity = 'CRITICAL'
): ProgrammaticPromise {
  return {
    id,
    description,
    severity,
    // By default, snapshot promises are run-scoped, but could be session-scoped if defined.
    async evaluate(ctx) {
      const evidence = await extractEvidence(ctx);
      
      const snapshotsDir = path.join(process.cwd(), '__snapshots__');
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }
      
      const snapPath = path.join(snapshotsDir, `${id}.snap.json`);
      const serializedEvidence = JSON.stringify(evidence, null, 2);
      
      if (ctx.updateSnapshots) {
        fs.writeFileSync(snapPath, serializedEvidence, 'utf-8');
        return { passed: true, message: `Snapshot updated for ${id}` };
      }
      
      if (!fs.existsSync(snapPath)) {
        return { passed: false, message: `Snapshot file not found: ${snapPath}. Run with --update-snapshots to create it.` };
      }
      
      const expected = fs.readFileSync(snapPath, 'utf-8');
      
      if (expected !== serializedEvidence) {
        return { passed: false, message: `Snapshot mismatch for ${id}.`, actualValue: serializedEvidence };
      }
      
      return { passed: true };
    }
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
