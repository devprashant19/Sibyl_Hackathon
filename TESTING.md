# Testing Sibyl

Written for anyone evaluating this without wanting to read the code first.

> **In one paragraph** — clone, `pnpm install`, `pnpm smoke`. In about fifteen seconds it starts the
> real API, runs the real CLI against a real workflow with real fault injection, uploads the result,
> reads it back over REST and SSE, checks the same seed finds the same failures in a fresh process, and
> replays a failing run both from disk and from the API. 22 checks; it exits non-zero on the first one
> that fails. Then run an example yourself and replay what it finds.

There are three levels. Each takes longer and shows more.

| Level | Effort | What you see | Needs |
|---|---|---|---|
| **1. The smoke test** | 2 min | Every hop of the main path checked by a script | Node 22, pnpm 9 |
| **2. Drive it yourself** | 10 min | Find a bug, replay it, watch it in the dashboard | Same |
| **3. The full suites** | 10 min | Every package's unit tests, the type check, the dashboard build | Same |

Nothing needs a database, Redis, Docker or an API key, except where marked.

---

## Level 1 — The smoke test

```bash
git clone https://github.com/devprashant19/Sibyl.git
cd Sibyl
pnpm install
pnpm smoke
```

What it does, in order (read [`scripts/smoke.mjs`](scripts/smoke.mjs) — it is short):

1. Starts the API on a random port with a token and a temp data directory; checks health, that an
   upload without the token is refused, and that malformed JSON is a 400.
2. Runs `sibyl init` in a fresh folder, then `sibyl doctor` against the API.
3. Runs `sibyl ci -n 40 --seed smoke --junit …` with the upload configured, listening on the API's SSE
   stream at the same time. Checks exit code 1, failures found, JUnit written, session saved and uploaded.
4. Runs the same seed again in a new process and checks the failure count matches.
5. Queries the API: failed runs, run detail with the event timeline, promise trends; checks the SSE
   listener received progress and a completion event.
6. Replays a failing run by id prefix from disk, then again with the local sessions hidden so it must
   come from the API, then an unknown id.

---

## Level 2 — Drive it yourself

### Find a bug

```bash
pnpm sibyl run -c packages/cli/examples/quickstart/sibyl.config.ts -n 30 --seed try
```

The config is short; read it
([`packages/cli/examples/quickstart/sibyl.config.ts`](packages/cli/examples/quickstart/sibyl.config.ts)).
A checkout calls a local payment server and retries on failure without an idempotency key. The HTTP
driver injects 503s at a probability the strategy chooses. When the first attempt fails, the retry
charges again, and `charge-at-most-once` breaks.

Look at:

- **Failures correlate with probability.** Runs at `p=0.125` mostly pass; runs at `p=0.875` mostly fail.
  A search that ignored its own results would not show this.
- **The same seed gives the same result.** Run the command twice.
- **A different seed gives a different result.** Change `--seed`.

### Replay it

```bash
pnpm sibyl replay <the id it printed> -c packages/cli/examples/quickstart/sibyl.config.ts --events
```

It should print `✔ Reproduced: same outcome and same fault decisions`. To see replay *fail* honestly,
edit the config so the workflow depends on `Math.random()` and replay again: it reports what differed
and exits 1.

### A bug that needs searching

```bash
pnpm sibyl run -c packages/cli/examples/inventory-race/sibyl.config.ts -n 40 --seed try
```

A lost update that only happens when a write is delayed by more than 25 ms; the template allows 1–120
ms. The Bayesian strategy starts uniform and concentrates on delays that fail. Open the saved session in
`packages/cli/examples/inventory-race/.sibyl/sessions/` and sort the runs by `delayMs`: short delays pass,
long ones fail. Runs close to the boundary may come back `INTERMITTENT` — failed once, passed on a retry
with the same seed — because that boundary is wall-clock timing, which a seed cannot control.

### Watch it in the dashboard

```bash
pnpm api          # terminal 1
pnpm dashboard    # terminal 2
SIBYL_API_URL=http://127.0.0.1:4000 pnpm sibyl run -c packages/cli/examples/inventory-race/sibyl.config.ts -n 40
```

Open http://localhost:3000/runs while it runs: the live session panel counts up, then the failing runs
appear. Open one for its schedule, the failed promise, the captured events and the replay command.
`/trends` shows each promise's fail rate per session — run twice to get two points.

### AI explanation (needs `ANTHROPIC_API_KEY`)

```bash
pnpm sibyl explain <runId> -c packages/cli/examples/quickstart/sibyl.config.ts
```

Without a key, or with `SIBYL_DISABLE_AI=1`, it says why and prints the captured evidence instead.

---

## Level 3 — The full suites

```bash
pnpm typecheck        # tsc --build: 0 errors
pnpm test             # every package's unit tests via turbo
pnpm test:drivers     # fault drivers incl. determinism properties
pnpm --filter @sibyl/dashboard build
```

| Suite | Tests |
|---|---|
| `@sibyl/core` | 57 (18 are regression tests, one per engine defect fixed) |
| `@sibyl/agent` | 51, no network |
| fault drivers | 43 |
| `@sibyl/dashboard` | 22 |
| `@sibyl/api` | 14, over real HTTP |
| `@sibyl/cli` | 12 |
| `@sibyl/shared` | 11 |
| `@sibyl/worker` | 7 |
| `@sibyl/ui` | 7 |

Integration tests for the database and message-queue drivers use Testcontainers and need Docker:
`pnpm test:integration`.

---

## Limits, stated up front

- **Timing is not seeded.** Replay reproduces every fault *decision*. If the outcome depended on how long
  something took in wall-clock time, a replay can differ, and it says so. Flake confirmation exists for
  the same reason.
- **The CLI is not on npm.** Run it from this repository. A config must import `@sibyl/core` from the
  workspace.
- **Node only.** The Python, Go and Java SDKs are not connected to the engine.
- **In-process drivers.** The HTTP driver patches globals for the whole process during a session. Point
  Sibyl at a test process.
- **Scaffolding is labelled.** The distributed worker, billing, SSO/SCIM, audit and compliance modules
  are libraries with tests, not running features. [`ARCHITECTURE.md`](ARCHITECTURE.md) §6.3 has the list.
- **The API has no read authentication.** Reads are open; writes need the token when one is set.
