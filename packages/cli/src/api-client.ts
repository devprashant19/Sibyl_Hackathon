import type { CreateSessionRequest, ProgressEvent, RunDetail } from '@sibyl/shared';

export class ApiRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Talks to the Sibyl API (SIBYL_API_URL). Uploading is best-effort: the local file is the record. */
export class ApiClient {
  private lastProgressAt = 0;
  private pendingProgress?: ReturnType<typeof setTimeout>;

  constructor(private baseUrl: string, private token?: string, private timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request(method: string, route: string, body?: unknown) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${route}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      throw new ApiRequestError(`Could not reach ${this.baseUrl}: ${err?.cause?.message ?? err.message}`);
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new ApiRequestError(`${method} ${route} → ${res.status}: ${json?.error?.message ?? text}`, res.status);
    }
    return json;
  }

  async health(): Promise<any> {
    return this.request('GET', '/api/health');
  }

  async createSession(payload: CreateSessionRequest & { id: string }): Promise<string> {
    const json = await this.request('POST', '/api/v1/sessions', payload);
    return json.data.id;
  }

  async getRun(runId: string): Promise<RunDetail | undefined> {
    try {
      return (await this.request('GET', `/api/v1/runs/${encodeURIComponent(runId)}`)).data;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return undefined;
      throw err;
    }
  }

  /**
   * Posts progress at most every `intervalMs`, always delivering the latest value, never throwing.
   * A slow or absent API must not slow the search down.
   */
  reportProgress(event: Omit<ProgressEvent, 'sessionId'> & { sessionId: string }, intervalMs = 250) {
    const send = () => {
      this.lastProgressAt = Date.now();
      this.request('POST', `/api/v1/sessions/${event.sessionId}/progress`, event).catch(() => {});
    };
    if (this.pendingProgress) clearTimeout(this.pendingProgress);
    const wait = intervalMs - (Date.now() - this.lastProgressAt);
    if (wait <= 0) send();
    else this.pendingProgress = setTimeout(send, wait);
  }

  flushProgress() {
    if (this.pendingProgress) clearTimeout(this.pendingProgress);
    this.pendingProgress = undefined;
  }
}
