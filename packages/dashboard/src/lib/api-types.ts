/**
 * Type-only copy of the Sibyl API contract used by the dashboard.
 *
 * Source of truth: packages/shared/src/api-schemas.ts (Session, SessionListItem, RunListItem,
 * RunDetail, PromiseTrend, ProgressEvent, HealthResponse, Api*Response) and
 * packages/shared/src/schemas.ts (FaultSchedule, PromiseResult, CapturedEvent).
 *
 * `@sibyl/shared` is not a dependency of the dashboard (and importing it would pull zod into the
 * client bundle), so the inferred zod types are written out by hand here. If the schemas change,
 * update this file to match — or replace it with `import type { ... } from "@sibyl/shared"` once the
 * workspace package is linked into the dashboard.
 */

// --- schemas.ts ---

export type FaultDomain =
  | "HTTP"
  | "DATABASE"
  | "MESSAGE_QUEUE"
  | "GRPC"
  | "FILESYSTEM"
  | "CLOCK"
  | "PROCESS"
  | "MEMORY"
  | "CPU";

export type FaultSpec =
  | { domain: "HTTP"; type: string; status?: number; delayMs?: number }
  | { domain: "DATABASE"; type: string; delayMs?: number }
  | { domain: "MESSAGE_QUEUE"; type: string; delayMs?: number }
  | { domain: "GRPC"; type: string; delayMs?: number }
  | { domain: "FILESYSTEM"; type: string; delayMs?: number }
  | { domain: "CLOCK"; type: string; offsetMs?: number }
  | { domain: "PROCESS"; type: string }
  | { domain: "MEMORY"; type: string; percentage: number; durationMs: number }
  | { domain: "CPU"; type: string; percentage: number; durationMs: number };

export interface FaultSchedule {
  id: string;
  spec: FaultSpec;
  probability: number;
  startTime?: number;
  endTime?: number;
  target?: Record<string, unknown>;
}

export type PromiseSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface PromiseResult {
  promiseId: string;
  simulationRunId: string;
  passed: boolean;
  severity: PromiseSeverity;
  message?: string;
  actualValue?: number | string;
  evaluatedAt: number;
  intermittent?: boolean;
}

interface EventBase<D extends FaultDomain, P> {
  domain: D;
  id?: string;
  /** Epoch milliseconds. */
  timestamp: number;
  payload: P;
}

export type CapturedEvent =
  | EventBase<"HTTP", { method: string; url: string; statusCode: number; durationMs: number }>
  | EventBase<"DATABASE", { query: string; durationMs: number }>
  | EventBase<"MESSAGE_QUEUE", { topic: string; messageId: string }>
  | EventBase<"GRPC", { method: string; statusCode: number }>
  | EventBase<"FILESYSTEM", { path: string; operation: "READ" | "WRITE" | "STAT" | "DELETE" }>
  | EventBase<"CLOCK", { originalTime: number; skewedTime: number }>
  | EventBase<"PROCESS", { pid: number; signal?: string }>
  | EventBase<"MEMORY", { utilization: number }>
  | EventBase<"CPU", { utilization: number }>;

// --- api-schemas.ts ---

export type RunStatusValue = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "ERRORED" | "INTERMITTENT";

export interface RunRecordPayload {
  runId: string;
  seed: string;
  status: RunStatusValue;
  passed: boolean;
  concreteSchedules: FaultSchedule[];
  promiseResults: PromiseResult[];
  error?: string;
  durationMs?: number;
  eventCount?: number;
  /** Present for runs that did not pass. Passing runs are summarised by eventCount. */
  events?: CapturedEvent[];
}

export interface PromiseDescriptor {
  id: string;
  description: string;
  severity: PromiseSeverity;
  scope?: "run" | "session";
}

export interface SessionSummaryCounts {
  totalRuns: number;
  failures: number;
  passes: number;
  errored: number;
  intermittent: number;
}

export interface Session {
  id: string;
  project: string;
  seed: string;
  strategy: string;
  iterations: number;
  startedAt: number;
  completedAt: number;
  summary: SessionSummaryCounts;
  promises: PromiseDescriptor[];
  sessionPromiseResults?: PromiseResult[];
  runs: RunRecordPayload[];
  source: "cli" | "ci" | "api";
  git?: { commit?: string; branch?: string };
  createdAt: number;
}

export type SessionListItem = Omit<Session, "runs" | "sessionPromiseResults">;

/** A run as listed across sessions: no event timeline, plus the session it belongs to. */
export type RunListItem = Omit<RunRecordPayload, "events"> & {
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
  severity: PromiseSeverity;
  points: PromiseTrendPoint[];
}

/** Server-sent event on /api/v1/sessions/:id/progress and /api/v1/events. */
export interface ProgressEvent {
  type: "progress" | "completed";
  sessionId: string;
  project?: string;
  done: number;
  total: number;
  failures: number;
  lastRun?: { runId: string; status: RunStatusValue };
}

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
  status: "ok";
  version: string;
  storage: { kind: "file" | "memory"; path?: string };
  sessions: number;
  runs: number;
  uptimeMs: number;
  auth: { writesRequireToken: boolean };
}
