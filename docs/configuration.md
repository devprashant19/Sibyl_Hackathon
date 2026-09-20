# Configuration

## The config file

A `sibyl.config.ts` default-exports a `SibylConfig` ([`packages/core/src/config.ts`](../packages/core/src/config.ts)).
Named exports (`export const workflow = …`) work too.

```ts
import { defineConfig, AsyncContext } from '@sibyl/core';

export default defineConfig({
  project: 'checkout',            // default: the config's folder name
  drivers: ['http'],              // or driver instances, see below
  workflow: async () => { … },    // one run; throwing makes the run ERRORED
  templates: [ … ],
  promises: [ … ],

  // All optional; command-line flags override them.
  iterations: 100,
  concurrency: 1,
  seed: 'fixed-seed',
  strategy: 'ucb1',               // 'ucb1' | 'mcts' | 'bayesian'
  clock: { mode: 'realtime' },    // or { mode: 'accelerated', startTime?, skewMs? }
  runTimeoutMs: 30_000,
  flakeRetries: 2,
  earlyExit: false,
  setup: async () => { … },       // once before the session, e.g. start a test server
  teardown: async () => { … },    // once after, even if the session throws
});
```

The CLI validates the file and lists every problem at once.

### Templates

A template describes a fault with ranges; the strategy picks the concrete values.

```ts
{
  id: '6f0c7f4e-4c1f-4a55-9d0e-6b1f5b2a7c11',        // a uuid
  spec: { domain: 'HTTP', type: 'SLOW_RESPONSE' },    // see packages/shared/src/schemas.ts
  target: { method: 'PUT' },                          // optional: only calls whose metadata matches
  probabilityRange: [0, 1],                           // optional; absent means probability 1
  delayMsRange: [1, 120],                             // optional; sets spec.delayMs
}
```

Each range is split into 4 buckets; the concrete value is a bucket midpoint (UCB1, MCTS) or a sampled
value (Bayesian). `target` keys are matched exactly against what the driver reports: the HTTP driver
reports `url` and `method`, gRPC `method`, MQ `topic` and `operation`, filesystem `path` and `operation`.

Fault types by domain:

| Domain | Types |
|---|---|
| `HTTP` | `TIMEOUT`, `SLOW_RESPONSE`, `CONNECTION_REFUSED`, `HTTP_5XX`, `HTTP_4XX`, `PARTIAL_RESPONSE`, `DUPLICATE_RESPONSE`¹, `DNS_FAILURE`¹, `TLS_HANDSHAKE_FAILURE`¹ |
| `DATABASE` | `QUERY_TIMEOUT`, `CONNECTION_DROP`, `DEADLOCK`, `SLOW_QUERY`, `PARTIAL_COMMIT` |
| `MESSAGE_QUEUE` | `MESSAGE_DELAY`, `MESSAGE_DUPLICATE`, `MESSAGE_LOSS`, `OUT_OF_ORDER_DELIVERY`, `CONSUMER_CRASH_MID_PROCESSING` |
| `GRPC` | `DEADLINE_EXCEEDED`, `UNAVAILABLE`, `RESOURCE_EXHAUSTED` |
| `FILESYSTEM` | `DISK_FULL`, `SLOW_IO`, `PERMISSION_DENIED`, `PARTIAL_WRITE` |
| `CLOCK` | `CLOCK_SKEW`, `TIME_JUMP` (use `offsetMs`; decided once when the run starts) |
| `PROCESS` | `CRASH`, `OOM_KILL`, `SIGTERM_DURING_OPERATION` |
| `MEMORY`, `CPU` | `PRESSURE` (use `percentage`, `durationMs`) |

¹ Valid in the schema; the HTTP driver does not implement them yet and passes the request through.

### Promises

```ts
{
  id: 'no-lost-sales',
  description: 'Stock on hand equals initial stock minus items sold',
  severity: 'CRITICAL',                                // CRITICAL | HIGH | MEDIUM | LOW
  scope: 'run',                                        // or 'session': evaluated once over all runs
  evaluate: (ctx) => ({ passed: …, message: '…', actualValue: 9 }),   // or return a boolean
}
```

`ctx` for a run-scoped promise: `runId`, `events` (captured events), `timeline(filter?)` (events sorted by
time). For a session-scoped promise: `runs`, every run record.

Promises may close over application state. If `concurrency > 1`, key that state by
`AsyncContext.getRunId()` in the workflow and `ctx.runId` in the promise, as the inventory example does.

### Drivers

`'http'` installs the HTTP driver for the session. The other drivers wrap a client object, so you create
them next to that client and pass the instance:

```ts
import { DatabaseFaultDriver, wrapPgPool } from '@sibyl-fault-drivers/db';

const dbDriver = new DatabaseFaultDriver();
const pool = wrapPgPool(new Pool({ … }), dbDriver);

export default defineConfig({ drivers: ['http', dbDriver], … });
```

Check each driver's `src/index.ts` for its exact wrapper signature.

## Environment variables

| Variable | Read by | Default | |
|---|---|---|---|
| `SIBYL_API_URL` | CLI | — | Upload target; `replay` fallback lookup |
| `SIBYL_API_TOKEN` | CLI, API | — | Bearer token for writes |
| `PORT` | API | `4000` | |
| `SIBYL_API_HOST` | API | `127.0.0.1` | `0.0.0.0` in a container |
| `SIBYL_DATA_DIR` | API | `~/.sibyl/data/sessions` | `:memory:` for no persistence |
| `SIBYL_RETENTION_DAYS` | API | — | Positive number |
| `SIBYL_CORS_ORIGIN` | API | `*` | |
| `SIBYL_WEBHOOK_URL` / `SIBYL_WEBHOOK_SECRET` | API | — | Both or neither |
| `NEXT_PUBLIC_SIBYL_API_URL` | Dashboard (build time) | `http://localhost:4000` | Must be reachable from the browser |
| `ANTHROPIC_API_KEY` | CLI | — | AI commands |
| `SIBYL_AGENT_MODEL` | Agents | `claude-sonnet-5` | |
| `SIBYL_DISABLE_AI` | Agents | — | `1`, `true`, `yes`, `on` (any case) |
| `SIBYL_AGENT_CACHE_DIR` | Agents | `~/.sibyl/agent-cache` | |
| `SIBYL_AGENT_BUDGET_FILE` | Agents | `~/.sibyl/agent-budget.json` | |
| `SIBYL_ENTERPRISE_SELF_HOSTED` | `@sibyl/core/enterprise` billing | — | Truthy disables metering limits |
| `SIBYL_SANDBOX_MODE` | resource driver | — | Must be `true` for CPU/memory pressure |
| `POSTGRES_URI` | SSO / SCIM | — | Required; they refuse to start without it |
| `REDIS_URL` | Worker | `redis://localhost:6379` | Scaffold |
| `WORKER_CONCURRENCY` | Worker | `5` | Scaffold |

## Files

| Path | Written by | |
|---|---|---|
| `<config dir>/.sibyl/sessions/<id>.json` | CLI | One per session. Gitignored in this repo. |
| `$SIBYL_DATA_DIR/<id>.json` | API | Same shape |
| `~/.sibyl/agent-cache/`, `~/.sibyl/agent-budget.json` | Agents | |
| `sibyl-fix-handoff.md` | `sibyl explain --suggest-fix` | In the working directory |
| `__snapshots__/<id>.snap.json` | `snapshotPromise` | In the working directory |
