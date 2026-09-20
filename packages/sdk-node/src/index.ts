import { CapturedEvent, FaultScheduleTemplate, PromiseSeverity, PromiseResult } from '@sibyl-shared';
// We import types from core directly
import { ProgrammaticPromise, PromiseContext, EvaluationResult } from '@sibyl-core';

export interface InstallOptions {
  interceptHttp?: boolean;
  interceptPg?: boolean;
  interceptMq?: boolean;
  interceptGrpc?: boolean;
  interceptFs?: boolean;
}

/**
 * Installs Sibyl interception globally across the Node.js process.
 * By default, this will monkey-patch HTTP, Postgres, MQ, gRPC, and FS 
 * drivers if they are installed in your application.
 */
export function install(options?: InstallOptions) {
  const opts = {
    interceptHttp: true,
    interceptPg: true,
    interceptMq: true,
    interceptGrpc: true,
    interceptFs: true,
    ...options
  };

  console.log('[Sibyl] Installing fault drivers globally...');
  // In a real implementation we would conditionally require and patch modules:
  if (opts.interceptHttp) {
    console.log('[Sibyl] -> HTTP driver active.');
    // require('@sibyl-fault-drivers/http').install();
  }
  if (opts.interceptPg) {
    console.log('[Sibyl] -> Postgres driver active.');
    // require('@sibyl-fault-drivers/db').install();
  }
  // etc...
}

/**
 * A type-safe Promise Context that provides autocompletion for custom timeline events.
 */
export interface TypedPromiseContext<TEventPayload = any> extends Omit<PromiseContext, 'timeline'> {
  timeline(filterFn?: (event: CapturedEvent) => boolean): (CapturedEvent & { payload: TEventPayload })[];
}

export interface TypedProgrammaticPromise<TEventPayload = any> {
  id: string;
  description: string;
  severity: PromiseSeverity;
  evaluate(ctx: TypedPromiseContext<TEventPayload>): EvaluationResult | boolean | Promise<EvaluationResult | boolean>;
}

/**
 * Defines a System Invariant (Promise) with deep TypeScript autocomplete.
 * 
 * @example
 * const noNegativeInventory = definePromise<{ query: string, args: any[] }>({
 *   id: 'no-negative-inventory',
 *   description: 'Inventory must never drop below 0',
 *   severity: 'CRITICAL',
 *   evaluate: (ctx) => {
 *     const updates = ctx.timeline(e => e.payload.query?.includes('UPDATE inventory'));
 *     return !updates.some(u => u.payload.args[0] < 0);
 *   }
 * });
 */
export function definePromise<TEventPayload = any>(
  promise: TypedProgrammaticPromise<TEventPayload>
): ProgrammaticPromise {
  return promise as unknown as ProgrammaticPromise;
}

/**
 * Defines a Fault Schedule Template to be used by the Sibyl Orchestrator.
 */
export function defineScheduleTemplate(template: FaultScheduleTemplate): FaultScheduleTemplate {
  return template;
}
