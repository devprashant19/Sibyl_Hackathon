import { z } from 'zod';
import { CapturedEventSchema, PromiseResultSchema, SimulationRunSchema } from './schemas';

// --- API Requests ---

export const IngestEventsRequestSchema = z.object({
  runId: z.string().uuid(),
  events: z.array(CapturedEventSchema),
});
export type IngestEventsRequest = z.infer<typeof IngestEventsRequestSchema>;

export const ReportPromisesRequestSchema = z.object({
  runId: z.string().uuid(),
  promises: z.array(PromiseResultSchema),
});
export type ReportPromisesRequest = z.infer<typeof ReportPromisesRequestSchema>;

// --- API Responses ---

export const GetRunResponseSchema = z.object({
  run: SimulationRunSchema,
});
export type GetRunResponse = z.infer<typeof GetRunResponseSchema>;
