# Sibyl — Deterministic Fault-Injection Search

## What This Is

A pnpm + Turborepo monorepo. The CLI loads a user's `sibyl.config.ts` (a workflow, fault templates,
promises, drivers), runs the workflow many times under seeded fault injection chosen by a search
strategy, checks the promises after every run, saves each session to `.sibyl/sessions/`, and uploads it
to an optional API that a Next.js dashboard reads. A failing run replays from its seed.

Long form: [`ARCHITECTURE.md`](ARCHITECTURE.md). Reference: [`docs/`](docs/README.md).

## Processes and ports

| Process | Entry | Port | Owns |
|---|---|---|---|
| CLI | `packages/cli/bin/sibyl.js` → `src/main.ts` (tsx) | — | The search. Runs next to the code under test. |
| API | `packages/api/src/server.ts` | `:4000` (`PORT`), `127.0.0.1` (`SIBYL_API_HOST`) | Session storage (JSON files), REST, SSE. Runs nothing. |
| Dashboard | `packages/dashboard` (`next dev`) | `:3000` | Reads the API over REST + SSE. |
| Worker | `packages/worker/src/index.ts` | — | Scaffold. Needs Redis + Docker; nothing enqueues jobs. |

## Source map

```
packages/
  shared/src/schemas.ts        fault specs, captured events, promise results (zod)
  shared/src/api-schemas.ts    THE contract between CLI, API and dashboard
  core/src/
    index.ts                   light engine entry — keep it free of heavy/networked deps
    enterprise.ts, queue/      server-side modules behind subpath exports
    prng.ts                    mulberry32 + fnv1a; fork() is order-independent
    clock.ts                   VirtualClock: patched globals, ref-counted, routed per run
    engine.ts                  one per run; evaluateFaultDecision(); rollHits()
    orchestrator.ts            the search loop; replay()
    search/{ucb1,mcts,bayesian}.ts
    promise.ts, config.ts (defineConfig), async-context.ts
  fault-drivers/<domain>/      http, db, mq, grpc, filesystem, process, resource
  cli/src/
    index.ts                   commands (buildProgram)
    session.ts                 config → orchestrator → Session payload; replayRun()
    config.ts, storage.ts, api-client.ts, junit.ts, template.ts
  api/src/{app.ts,store.ts,server.ts}
  agent/src/                   explainer, investigator (index.ts), patcher, postmortem, guardrails/
  dashboard/src/lib/api.ts     typed client; api-types.ts is a copy of shared's types
scripts/smoke.mjs              end-to-end check (pnpm smoke)
scripts/screenshots.mjs        regenerates docs/screenshots from the real UI (pnpm screenshots)
```

## Rules that are easy to break by accident

- **No unseeded randomness between a call and its fault decision.** Every decision draws from the
  engine's per-domain `PRNG` fork. `Math.random()` or `crypto.randomUUID()` in that path breaks replay
  silently. Ids that must be reproducible come from `prng.uuid()`.
- **Strategies key their bookkeeping by schedule id, never by extra fields on the schedule.** The
  orchestrator validates schedules with zod, which strips unknown keys. Hidden `_ucb1Key` fields were
  stripped for the project's whole history, so no strategy learned anything. A strategy test that
  calls `feedback()` directly will pass either way — test through `SearchOrchestrator`.
- **The fault probability rule is `rollHits()` in `engine.ts`**, and the orchestrator's duplicate
  fingerprint uses it too. Change one, change both.
- **The clock never captures natives per instance.** They are captured once at module load in `clock.ts`.
  Anything that must use real time inside a run (run timeouts, schedulers) uses `nativeSetTimeout` /
  `nativeNow`, or an accelerated clock will fire it instantly.
- **`@sibyl/core`'s root entry stays light.** Nothing it imports may open a connection or load
  Jackson/Stripe/Octokit/BullMQ at import time: the full index once took 98 s to import and connected to
  Redis. Put server-side modules behind `@sibyl/core/enterprise` or `@sibyl/core/queue`.
- **Package names are scoped: `@sibyl/<name>`.** `@sibyl-core` is not a valid package name; pnpm refuses
  to install it and Node's ESM resolver refuses to import it. Library packages are `"type": "module"`.
- **The shared contract has one home**: `packages/shared/src/api-schemas.ts`. The API validates writes
  with it and the CLI builds payloads from it. The dashboard's `src/lib/api-types.ts` is a manual copy —
  update it in the same change.
- **Every failure path cleans up**: drivers uninstall and the clock resolver resets in a `finally`; a
  sandbox is stopped and removed even when `start()` throws; a worker releases only a lock it owns.
- **Fail closed**: SSO, SCIM and the agent budget refuse when their backing store is missing or corrupt.
  Never add a "mock mode" that returns success.
- **No fabricated output.** No `Math.random()` results, hard-coded digests, or pretend success in
  anything a user reads. Pages without a backend carry the *Preview* banner.

## Event flow that must keep working

- CLI → API: `POST /api/v1/sessions/:id/progress` (throttled, fire-and-forget), then
  `POST /api/v1/sessions` with the whole session.
- API → browser: SSE `data: ProgressEvent` on `/api/v1/events` and `/api/v1/sessions/:id/progress`, with
  `type: 'completed'` after a session is stored.
- Replay: local `.sibyl/sessions` first, then `GET /api/v1/runs/:id` when `SIBYL_API_URL` is set.

## Conventions

- Paths from user input never reach `path.join` unvalidated (the API checks session ids are UUIDs
  before building file names).
- Writes to disk go to a temp file and are renamed into place.
- Test what you fixed with a test that fails on the old code; `packages/core/test/regressions.test.ts`
  holds one per engine defect.
- `pnpm typecheck`, `pnpm test`, `pnpm test:drivers` and `pnpm smoke` must pass before merging.

## Development

```bash
pnpm install
pnpm smoke                                   # end to end, ~15 s
pnpm --filter @sibyl/core test               # one package
pnpm sibyl run -c packages/cli/examples/quickstart/sibyl.config.ts
pnpm api & pnpm dashboard                    # :4000 and :3000
```

Windows note: in Git Bash, write multi-line scripts containing backslashes or quotes to a file rather
than a heredoc; and remove pnpm-linked directories with PowerShell `Remove-Item`, since `rm -rf` on a
junction can follow it into the target.
