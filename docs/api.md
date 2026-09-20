# REST API

The API stores search sessions uploaded by the CLI and serves them to the dashboard. It runs nothing.
Source: [`packages/api/src/app.ts`](../packages/api/src/app.ts). Every request and response shape is
defined once, in [`packages/shared/src/api-schemas.ts`](../packages/shared/src/api-schemas.ts).

```bash
pnpm api                                   # 127.0.0.1:4000, files in ~/.sibyl/data/sessions
PORT=5000 SIBYL_DATA_DIR=:memory: pnpm api # in-memory, nothing written
```

## Conventions

- JSON in, JSON out. Lists are `{ "data": [...] }`, single items `{ "data": {...} }`, newest first.
- Errors are always `{ "error": { "code", "message", "issues"? } }` with a non-2xx status:

  | Status | `code` | When |
  |---|---|---|
  | 400 | `invalid_request` | Body or query failed validation; `issues` holds the zod issues |
  | 400 | `invalid_json` | Body is not JSON |
  | 401 | `unauthorized` | Write without a valid bearer token, when `SIBYL_API_TOKEN` is set |
  | 404 | `not_found` | Unknown route, session or run |
  | 409 | `conflict` | A session with that id already exists |
  | 413 | `payload_too_large` | Body over 50 MB |
  | 500 | `internal` | A bug; details are logged, never returned |

- **Authentication.** Reads are open. When the server has `SIBYL_API_TOKEN`, every `POST` needs
  `Authorization: Bearer <token>`, compared in constant time.
- `limit` defaults to 100 and is capped at 1000.

## Health

### `GET /api/health`

```json
{
  "status": "ok",
  "version": "0.1.0",
  "storage": { "kind": "file", "path": "/home/me/.sibyl/data/sessions" },
  "sessions": 3,
  "runs": 120,
  "uptimeMs": 51234,
  "auth": { "writesRequireToken": true }
}
```

## Sessions

A session is one `sibyl run` or `sibyl ci`.

### `POST /api/v1/sessions` — write

Body: `CreateSessionRequest`. The CLI sends this; you rarely will.

| Field | Type | |
|---|---|---|
| `id` | uuid, optional | Generated if absent. The CLI sends its own, so the local file and the API agree. |
| `project` | string | |
| `seed`, `strategy` | string | |
| `iterations` | int | Requested; `summary.totalRuns` is what ran |
| `startedAt`, `completedAt` | epoch ms | |
| `summary` | `{ totalRuns, failures, passes, errored, intermittent }` | |
| `promises` | `{ id, description, severity, scope? }[]` | |
| `sessionPromiseResults` | `PromiseResult[]`, optional | |
| `runs` | `RunRecord[]`, at most 10,000 | See below |
| `source` | `cli` \| `ci` \| `api` | |
| `git` | `{ commit?, branch? }`, optional | |

`RunRecord`: `{ runId, seed, status, passed, concreteSchedules, promiseResults, error?, durationMs?,
eventCount?, events? }`. `status` is one of `COMPLETED`, `FAILED`, `INTERMITTENT`, `ERRORED` (and
`PENDING`, `RUNNING`, which the CLI never sends). `events` is present for runs that did not pass.

→ `201 { "data": { "id": "…" } }` with a `Location` header. A `completed` progress event is broadcast.

### `GET /api/v1/sessions?project=&limit=`

→ `{ "data": SessionListItem[] }` — sessions without their runs.

### `GET /api/v1/sessions/:id`

→ `{ "data": Session }` — runs included, event timelines omitted. 404 for an unknown or non-uuid id.

## Runs

### `GET /api/v1/runs?status=&project=&sessionId=&limit=`

→ `{ "data": RunListItem[] }`: each run without its timeline, plus `sessionId`, `project`, `createdAt`
and `failedPromises` (the ids of promises that failed). An unknown `status` is a 400.

```bash
curl -s 'http://127.0.0.1:4000/api/v1/runs?status=FAILED&limit=5'
```

### `GET /api/v1/runs/:runId`

→ `{ "data": RunDetail }`: the run with `events` (for runs that did not pass), plus `sessionId`,
`project`, `createdAt`, and the session's `promises` descriptors. `sibyl replay` uses this when a run is
not stored locally.

## Promises

### `GET /api/v1/promises/trends?project=`

→ `{ "data": PromiseTrend[] }`, one per run-scoped promise:

```json
{
  "promiseId": "no-lost-sales",
  "description": "Stock on hand equals initial stock minus items sold",
  "severity": "CRITICAL",
  "points": [
    { "sessionId": "…", "completedAt": 1757874000000, "runs": 40, "failedRuns": 25, "failRate": 0.625 }
  ]
}
```

`failRate` is a fraction in [0, 1]. Points are oldest first.

## Live progress (Server-Sent Events)

### `GET /api/v1/events` — every session
### `GET /api/v1/sessions/:id/progress` — one session

`Content-Type: text/event-stream`. The stream opens with a `: connected` comment, sends `: ping` every
15 s, and one `data:` frame per `ProgressEvent`:

```
data: {"type":"progress","sessionId":"…","project":"inventory-race","done":12,"total":40,"failures":7,"lastRun":{"runId":"…","status":"FAILED"}}

data: {"type":"completed","sessionId":"…","project":"inventory-race","done":40,"total":40,"failures":25}
```

### `POST /api/v1/sessions/:id/progress` — write

Body: a `ProgressEvent` without `sessionId` (taken from the path). → `202`. The CLI posts these at most
every 250 ms and never waits on them.

## Webhooks

With `SIBYL_WEBHOOK_URL` and `SIBYL_WEBHOOK_SECRET` set, every stored session is delivered as:

```http
POST <SIBYL_WEBHOOK_URL>
content-type: application/json
x-sibyl-event: session.completed        (or promise.failed when summary.failures > 0)
x-sibyl-delivery: <uuid>
x-sibyl-signature: <hex HMAC-SHA256 of the raw body with the secret>

{ "eventId", "eventType", "timestamp", "data": { "sessionId", "project", "seed", "summary" } }
```

A 5xx or network error is retried with exponential backoff up to 8 attempts; a 4xx other than 429 is
dropped. Each delivery times out after 10 s.

## Retention

With `SIBYL_RETENTION_DAYS=N`, sessions whose `createdAt` is older than N days are deleted — the file
and the in-memory index — at startup and every hour.
