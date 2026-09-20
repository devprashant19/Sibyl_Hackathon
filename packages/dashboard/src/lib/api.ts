import type {
  ApiErrorResponse,
  ApiItemResponse,
  ApiListResponse,
  HealthResponse,
  PromiseTrend,
  RunDetail,
  RunListItem,
  RunStatusValue,
  Session,
  SessionListItem,
} from "./api-types";

export const DEFAULT_API_URL = "http://localhost:4000";
export const DEFAULT_TIMEOUT_MS = 8000;
export const API_START_COMMAND = "pnpm --filter @sibyl/api start";

/**
 * Base URL of the Sibyl API. `NEXT_PUBLIC_*` variables are inlined at build time, so this must be
 * read as a literal `process.env.NEXT_PUBLIC_SIBYL_API_URL` expression.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SIBYL_API_URL;
  const base = configured && configured.trim() ? configured.trim() : DEFAULT_API_URL;
  return base.replace(/\/+$/, "");
}

export function apiUrl(path: string, query?: Record<string, string | number | undefined | null>): string {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export type ApiErrorKind = "network" | "timeout" | "http" | "parse";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly url: string;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, url: string, opts: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.url = url;
    this.status = opts.status;
    this.code = opts.code;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }

  /** True when the API process could not be reached at all (as opposed to answering with an error). */
  get isUnreachable(): boolean {
    return this.kind === "network" || this.kind === "timeout";
  }
}

export function unreachableMessage(): string {
  return `Can't reach the Sibyl API at ${getApiBaseUrl()}. Start it with \`${API_START_COMMAND}\`.`;
}

/** Human-readable message for any error thrown while loading data. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isUnreachable) return unreachableMessage();
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError";
}

export async function apiGet<T>(path: string, query?: Parameters<typeof apiUrl>[1], opts: RequestOptions = {}): Promise<T> {
  const url = apiUrl(path, query);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (timedOut) throw new ApiError("timeout", `Request to ${url} timed out`, url, { cause: err });
    // Caller-initiated aborts propagate unchanged so hooks can ignore them.
    if (isAbortError(err)) throw err;
    throw new ApiError("network", `Network error while requesting ${url}`, url, { cause: err });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }

  let body: unknown;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : undefined;
  } catch (err) {
    if (!res.ok) throw new ApiError("http", `API responded ${res.status} ${res.statusText}`.trim(), url, { status: res.status });
    throw new ApiError("parse", `API returned invalid JSON for ${path}`, url, { status: res.status, cause: err });
  }

  if (!res.ok) {
    const apiErr = (body as Partial<ApiErrorResponse> | undefined)?.error;
    const message = apiErr?.message ? `${apiErr.message} (HTTP ${res.status})` : `API responded ${res.status} ${res.statusText}`.trim();
    throw new ApiError("http", message, url, { status: res.status, code: apiErr?.code });
  }
  return body as T;
}

export interface ListRunsParams {
  status?: RunStatusValue;
  project?: string;
  sessionId?: string;
  limit?: number;
}

export const api = {
  health: (opts?: RequestOptions) => apiGet<HealthResponse>("/api/health", undefined, opts),

  listSessions: async (params: { project?: string; limit?: number } = {}, opts?: RequestOptions) =>
    (await apiGet<ApiListResponse<SessionListItem>>("/api/v1/sessions", { ...params }, opts)).data,

  getSession: async (id: string, opts?: RequestOptions) =>
    (await apiGet<ApiItemResponse<Session>>(`/api/v1/sessions/${encodeURIComponent(id)}`, undefined, opts)).data,

  listRuns: async (params: ListRunsParams = {}, opts?: RequestOptions) =>
    (await apiGet<ApiListResponse<RunListItem>>("/api/v1/runs", { ...params }, opts)).data,

  getRun: async (runId: string, opts?: RequestOptions) =>
    (await apiGet<ApiItemResponse<RunDetail>>(`/api/v1/runs/${encodeURIComponent(runId)}`, undefined, opts)).data,

  promiseTrends: async (params: { project?: string } = {}, opts?: RequestOptions) =>
    (await apiGet<ApiListResponse<PromiseTrend>>("/api/v1/promises/trends", { ...params }, opts)).data,

  /** SSE stream of ProgressEvents for every session, or for one session when `sessionId` is given. */
  progressStreamUrl: (sessionId?: string) =>
    sessionId ? apiUrl(`/api/v1/sessions/${encodeURIComponent(sessionId)}/progress`) : apiUrl("/api/v1/events"),
};
