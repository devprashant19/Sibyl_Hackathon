import type { CapturedEvent, FaultScheduleTemplate, PromiseSeverity } from '@sibyl/shared';
import type { ProgrammaticPromise, PromiseContext, EvaluationResult, SibylConfig } from '@sibyl/core';

// Typed helpers for writing a sibyl.config.ts. There is deliberately no `install()`: the previous
// one logged "HTTP driver active" without installing anything. Drivers are declared in the config
// (`drivers: ['http']`, or driver instances) and installed by the orchestrator for the session.

export { defineConfig } from '@sibyl/core';
export type { SibylConfig } from '@sibyl/core';

/**
 * A promise context whose event payloads are typed. Payload shapes come from the drivers you
 * install, so the type parameter is yours to supply.
 */
export interface TypedPromiseContext<TEventPayload = unknown> extends Omit<PromiseContext, 'timeline' | 'events'> {
  events: (CapturedEvent & { payload: TEventPayload })[];
  timeline(filterFn?: (event: CapturedEvent & { payload: TEventPayload }) => boolean): (CapturedEvent & { payload: TEventPayload })[];
}

export interface TypedProgrammaticPromise<TEventPayload = unknown> {
  id: string;
  description: string;
  severity: PromiseSeverity;
  scope?: 'run';
  evaluate(ctx: TypedPromiseContext<TEventPayload>): EvaluationResult | boolean | Promise<EvaluationResult | boolean>;
}

/**
 * Defines a run-scoped invariant with typed event payloads.
 *
 * @example
 * const noServerErrors = definePromise<{ statusCode: number }>({
 *   id: 'no-5xx',
 *   description: 'No request fails with a 5xx',
 *   severity: 'HIGH',
 *   evaluate: ctx => ctx.timeline(e => e.domain === 'HTTP').every(e => e.payload.statusCode < 500),
 * });
 */
export function definePromise<TEventPayload = unknown>(promise: TypedProgrammaticPromise<TEventPayload>): ProgrammaticPromise {
  return promise as unknown as ProgrammaticPromise;
}

/** Defines a fault schedule template. `id` must be a uuid; ranges are [min, max]. */
export function defineScheduleTemplate(template: FaultScheduleTemplate): FaultScheduleTemplate {
  return template;
}

export type { SibylConfig as Config };
