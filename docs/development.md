# Development

## Setup

Node **22+**, pnpm **9.9** (`corepack enable`). Nothing else for the main path.

```bash
pnpm install
pnpm smoke
```

## Layout

```
packages/
  shared/          zod schemas — fault specs, events, the CLI ↔ API ↔ dashboard contract
  core/            the engine (light root entry) + /enterprise + /queue + /retention subpaths
  fault-drivers/   http db mq grpc filesystem process resource — one package each
  cli/             sibyl; examples/quickstart and examples/inventory-race
  api/             Express 5 REST + SSE, file store
  dashboard/       Next.js 16
  ui/              shared React components
  agent/           Claude agents + guardrails
  worker/          BullMQ worker (scaffold)
  sdk-node/        typed config helpers
  sdk-python, sdk-go, sdk-java, vscode-extension, integrations, e2e
scripts/smoke.mjs  end-to-end check
infra/             Terraform + Pulumi (scaffold)
```

All TypeScript library packages are `"type": "module"`, export their `src/*.ts` directly, and run under
tsx or vitest; nothing needs building before it runs. `pnpm typecheck` (`tsc --build`) checks them all.

## Scripts

| Command | |
|---|---|
| `pnpm smoke` | End to end: real API, real CLI, real fault injection, 22 checks |
| `pnpm test` | Every package's unit tests through turbo |
| `pnpm test:drivers` | All fault drivers from their shared root (includes the determinism properties turbo's per-package runs don't) |
| `pnpm test:integration` | Testcontainers suites for db and mq drivers; needs Docker |
| `pnpm typecheck` | `tsc --build` |
| `pnpm sibyl …` | The CLI, from the repo root |
| `pnpm api` / `pnpm dashboard` | :4000 / :3000 |
| `pnpm --filter <pkg> test` | One package |

## Writing tests

- **Fix a bug, add the test that would have caught it.** Engine defects go in
  `packages/core/test/regressions.test.ts`, each with a comment saying what used to happen.
- **Test strategies through `SearchOrchestrator`**, not just by calling `next()`/`feedback()`: the
  orchestrator validates schedules, and a strategy that relies on anything zod strips will pass a direct
  test and learn nothing in practice.
- **The API tests use real HTTP** on port 0, not supertest or mocks.
- **No network in unit tests.** The agent tests mock the Anthropic client; the HTTP driver tests use a
  local server.
- **Wall-clock bounds measure the machine.** When a test must assert "fast", make the slow path an order
  of magnitude slower than the bound (see the process driver's CRASH test), since turbo runs CPU-pressure
  tests alongside everything else.

## Adding a fault driver

1. `packages/fault-drivers/<name>/` with `package.json` (`"type": "module"`, depend on `@sibyl/core` and
   `@sibyl/shared`), `tsconfig.json` extending the base, `src/index.ts`, `test/`.
2. Implement `FaultDriver`: `domain`, `install(ctx)`, `uninstall()`. On every intercepted operation call
   `ctx.getFaultDecision(domain, metadata)`; when it returns a spec, apply it and `ctx.recordEvent({ domain,
   fault: spec.type, payload })` with a payload matching the domain's schema.
3. Never draw randomness yourself — use `ctx.prng` if you need a random choice inside a fault.
4. Add the domain's fault types and payload schema to `packages/shared/src/schemas.ts` if new.
5. Add it to the root `tsconfig.json` references and to the determinism property test.

## Adding a search strategy

Implement `SearchStrategy` (`packages/core/src/search/strategy.ts`): `next(i)` returns concrete schedules
with fresh uuid ids; `feedback(record)` receives the run with *those* schedules. Keep any per-schedule
bookkeeping in a map keyed by schedule id. Implement `exportState`/`importState` so sessions can resume.
Register the name in `packages/cli/src/session.ts` and `StrategyName` in `packages/core/src/config.ts`.

## Changing the API contract

Edit `packages/shared/src/api-schemas.ts`, then the API route, then the CLI payload builder
(`packages/cli/src/session.ts`), then the dashboard's copy (`packages/dashboard/src/lib/api-types.ts`),
then [`docs/api.md`](api.md). `pnpm smoke` exercises the whole chain.

## Windows notes

- Git Bash heredocs mangle backslashes and quotes; write scripts to a file.
- `rm -rf` on a pnpm-linked directory can follow the junction into the target package. Use PowerShell
  `Remove-Item`, or remove only the link.
- The process driver kills whole process trees on Windows (`cmd.exe` does not exec its command); see
  `packages/fault-drivers/process/src/process-wrapper.ts`.
