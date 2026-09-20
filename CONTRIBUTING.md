# Contributing to Sibyl

Thank you for your interest in contributing to Sibyl. This document covers the development workflow, code conventions, and process for submitting changes.

## Development Setup

### Prerequisites

- **Node.js** ≥ 22
- **pnpm** 9.9 (`corepack enable`)
- **Docker** — only for the db/mq driver integration tests (`pnpm test:integration`)

No database or Redis is needed for the CLI, API, dashboard or any unit test.

### Getting Started

```bash
git clone https://github.com/devprashant19/Sibyl.git
cd Sibyl
pnpm install
pnpm smoke
```

### Running Tests

```bash
pnpm smoke                          # end to end, ~15 s
pnpm test                           # every package (turbo)
pnpm test:drivers                   # fault drivers incl. determinism properties
pnpm typecheck                      # tsc --build
pnpm --filter @sibyl/core test      # one package
```

Before opening a pull request, all four must pass. Read [`CLAUDE.md`](CLAUDE.md) for the invariants that
are easy to break, and [`docs/development.md`](docs/development.md) for how to add a driver or strategy.

## Monorepo Structure

This project uses **pnpm workspaces** with **Turborepo** for build orchestration. All packages are in `packages/`. Cross-package dependencies use workspace protocol (`workspace:*`).

### Build Order

Turborepo handles dependency ordering automatically via `turbo.json`. The general dependency graph is:

```
shared → core → fault-drivers → {cli, api, worker, sdk-node}
shared → agent → cli
ui → dashboard
```

Always run `pnpm build` from the root after making cross-package changes.

## Code Conventions

### TypeScript

- **Strict mode** is enabled everywhere via `tsconfig.base.json`.
- Use **explicit return types** on public API functions.
- Prefer **`interface`** over `type` for object shapes that may be extended.
- Use **Zod schemas** (in `packages/shared`) as the single source of truth for runtime validation. Derive TypeScript types from schemas using `z.infer<>`.

### Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Database tables: `snake_case`

### Documentation

- Every exported function, class, and interface must have a JSDoc comment.
- Non-obvious design decisions should have inline comments explaining *why*, not *what*.
- If you add a new package, add a `README.md` with the structure described below.

### Testing

- Unit tests live alongside source in `__tests__/` or in a top-level `test/` directory.
- Use **Vitest** for all TypeScript tests.
- Engine defects get a regression test in `packages/core/test/regressions.test.ts` that fails on the old code.
- **Never** commit tests that depend on external services (APIs, databases) without a mock. Use the existing mock patterns in `packages/agent/tests/`.

## Branching & Pull Requests

### Branch Naming

```
feature/<short-description>   — New features
fix/<short-description>       — Bug fixes
docs/<short-description>      — Documentation changes
refactor/<short-description>  — Code restructuring without behavior changes
```

### Pull Request Process

1. **Create a branch** from `main`.
2. **Make your changes** following the code conventions above.
3. **Write tests** for any new functionality.
4. **Run the full test suite** locally: `pnpm test`.
5. **Open a PR** with a clear title and description.
6. **Wait for CI** — all checks must pass.
7. **Request review** from a maintainer.

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add gRPC fault driver
fix: prevent cross-run event leakage in AsyncContext
docs: add architecture deep-dive
test: add webhook idempotency bug-suite example
refactor: extract SearchStrategy interface
chore: bump turborepo to 2.1.3
```

## Adding a Fault Driver or Search Strategy

See [`docs/development.md`](docs/development.md#adding-a-fault-driver). Two rules matter more than the rest:
drivers take every random choice from the engine's seeded streams, and strategies key their bookkeeping
by schedule id and are tested through `SearchOrchestrator`.
