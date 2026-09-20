# Contributing to Sibyl

Thank you for your interest in contributing to Sibyl. This document covers the development workflow, code conventions, and process for submitting changes.

## Development Setup

### Prerequisites

- **Node.js** ≥ 20 (we recommend using [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm))
- **pnpm** ≥ 9.9 (`corepack enable && corepack prepare pnpm@9.9.0 --activate`)
- **Docker** & **Docker Compose** (for worker sandboxes and integration tests)
- **PostgreSQL** 15+ and **Redis** 7+ (or use `docker-compose up -d`)

### Getting Started

```bash
git clone https://github.com/devprashant19/Sibyl.git
cd Sibyl
pnpm install
pnpm build
```

### Running Tests

```bash
# All tests (via Turborepo)
pnpm test

# Single package
cd packages/core && pnpm test

# Watch mode
cd packages/core && pnpm test -- --watch

# Load tests
npx tsx packages/core/test/load-test.ts
```

## Monorepo Structure

This project uses **pnpm workspaces** with **Turborepo** for build orchestration. All packages are in `packages/`. Cross-package dependencies use workspace protocol (`workspace:*`).

### Build Order

Turborepo handles dependency ordering automatically via `turbo.json`. The general dependency graph is:

```
shared → core → {api, worker, agent, cli, sdk-*}
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
- The bug-suite tests in `packages/core/examples/bug-suite/` are deterministic regression tests for the search engine. If you modify search strategies, these tests must still pass with the documented seeds.
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

## Adding a New Fault Driver

1. Create a new directory under `packages/fault-drivers/<domain>/`.
2. Implement the `FaultDriver` interface from `packages/core/src/driver.ts`.
3. The driver must:
   - Intercept the relevant I/O operations using monkey-patching or module instrumentation.
   - Call `context.getFaultDecision()` on each intercepted operation.
   - Call `context.recordEvent()` for every operation (faulted or not).
   - Cleanly restore original behavior in `uninstall()`.
4. Add the domain to the `FaultDomain` union type in `packages/shared`.
5. Add Zod schemas for the new `FaultSpec` variants.
6. Write at least one bug-suite example that demonstrates a bug catchable only by this driver.
7. Document the driver in `docs/reference/fault-domains.mdx`.

## Adding a New Search Strategy

1. Implement the `SearchStrategy` interface from `packages/core/src/search/strategy.ts`.
2. The interface requires:
   - `next(iteration: number): FaultSchedule[]` — returns the schedules for the next run.
   - `feedback(result: RunResult): void` — receives the result of the previous run for learning.
3. Add the strategy to the CLI's `--strategy` flag options.
4. Document the strategy in `docs/deep-dives/search-algorithms.mdx`.
5. Benchmark it against the bug-suite to establish a baseline detection rate.

## Security

If you discover a security vulnerability, **do not** open a public issue. See [SECURITY.md](./SECURITY.md) for responsible disclosure instructions.

## License

By contributing to Sibyl, you agree that your contributions will be licensed under the same license as the project.
