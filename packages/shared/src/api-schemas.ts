import { z } from 'zod';
import {
  CapturedEventSchema,
  FaultScheduleSchema,
  PromiseResultSchema,
  PromiseSeveritySchema,
  SimulationRunSchema,
} from './schemas';

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

// --- Search sessions (v1) ---
//
// A session is one `sibyl run` / `sibyl ci`: N runs of one workflow under one master seed.
// The CLI uploads the finished session in one request; the API stores it and serves it to the
// dashboard. These schemas are the contract between the three — change them here, not in a copy.

export const RunStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ERRORED', 'INTERMITTENT']);
export type RunStatusValue = z.infer<typeof RunStatusSchema>;

export const RunRecordSchema = z.object({
  runId: z.string().min(1),
  seed: z.string().min(1),
  status: RunStatusSchema,
  passed: z.boolean(),
  concreteSchedules: z.array(FaultScheduleSchema),
  promiseResults: z.array(PromiseResultSchema),
  error: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  eventCount: z.number().int().nonnegative().optional(),
  /** Present for runs that did not pass. Passing runs are summarised by eventCount. */
  events: z.array(CapturedEventSchema).optional(),
});
export type RunRecordPayload = z.infer<typeof RunRecordSchema>;

export const PromiseDescriptorSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  severity: PromiseSeveritySchema,
  scope: z.enum(['run', 'session']).optional(),
});
export type PromiseDescriptor = z.infer<typeof PromiseDescriptorSchema>;

export const SessionSummaryCountsSchema = z.object({
  totalRuns: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  passes: z.number().int().nonnegative(),
  errored: z.number().int().nonnegative(),
  intermittent: z.number().int().nonnegative(),
});
export type SessionSummaryCounts = z.infer<typeof SessionSummaryCountsSchema>;

/** Hard cap on runs per upload, so one request cannot exhaust the API's memory. */
export const MAX_RUNS_PER_SESSION = 10_000;

export const CreateSessionRequestSchema = z.object({
  id: z.string().uuid().optional(),
  project: z.string().min(1).max(200),
  seed: z.string().min(1),
  strategy: z.string().min(1),
  iterations: z.number().int().positive(),
  startedAt: z.number(),
  completedAt: z.number(),
  summary: SessionSummaryCountsSchema,
  promises: z.array(PromiseDescriptorSchema),
  sessionPromiseResults: z.array(PromiseResultSchema).optional(),
  runs: z.array(RunRecordSchema).max(MAX_RUNS_PER_SESSION),
  source: z.enum(['cli', 'ci', 'api']).default('cli'),
  git: z.object({ commit: z.string().optional(), branch: z.string().optional() }).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const SessionSchema = CreateSessionRequestSchema.extend({
  id: z.string().uuid(),
  createdAt: z.number(),
});
export type Session = z.infer<typeof SessionSchema>;

export type SessionListItem = Omit<Session, 'runs' | 'sessionPromiseResults'>;

/** A run as listed across sessions: no event timeline, plus the session it belongs to. */
export type RunListItem = Omit<RunRecordPayload, 'events'> & {
  sessionId: string;
  project: string;
  createdAt: number;
  failedPromises: string[];
};

export type RunDetail = RunRecordPayload & {
  sessionId: string;
  project: string;
  createdAt: number;
  promises: PromiseDescriptor[];
};

export interface PromiseTrendPoint {
  sessionId: string;
  completedAt: number;
  runs: number;
  failedRuns: number;
  failRate: number;
}

export interface PromiseTrend {
  promiseId: string;
  description: string;
  severity: z.infer<typeof PromiseSeveritySchema>;
  points: PromiseTrendPoint[];
}

/** Server-sent event on /api/v1/sessions/:id/progress and /api/v1/events. */
export const ProgressEventSchema = z.object({
  type: z.enum(['progress', 'completed']),
  sessionId: z.string().min(1),
  project: z.string().optional(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  lastRun: z.object({ runId: z.string(), status: RunStatusSchema }).optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export interface ApiListResponse<T> {
  data: T[];
}

export interface ApiItemResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: { code: string; message: string; issues?: unknown };
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  storage: { kind: 'file' | 'memory'; path?: string };
  sessions: number;
  runs: number;
  uptimeMs: number;
  auth: { writesRequireToken: boolean };
}
