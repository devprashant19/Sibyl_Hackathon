<p align="center">
  <strong>SIBYL</strong><br>
  <em>Foresight for production systems.</em>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#packages">Packages</a> ·
  <a href="#self-hosting">Self-Hosting</a> ·
  <a href="./docs">Documentation</a>
</p>

---

Sibyl is a **deterministic chaos engineering platform** that finds concurrency bugs, race conditions, and partial-failure scenarios in distributed systems — before they reach production.

Unlike traditional chaos tools that randomly kill pods and hope something breaks, Sibyl uses **Coverage-Guided Monte Carlo Tree Search (MCTS)** to systematically explore fault schedules at your application's real boundaries (HTTP, database, message queues, filesystem, clock, gRPC, process, and resource pressure), hunting for the exact interleaving that violates a business invariant you defined in code.

Every run is seeded and fully deterministic. A failure found once can be replayed on demand from a single seed, saved as a permanent regression test, and explained by an AI agent that grounds its analysis in the exact captured event timeline.

## Key Capabilities

| Capability | Description |
|---|---|
| **Promise DSL** | Define business invariants in code (`definePromise`) — "no double charges," "every webhook is processed exactly once" |
| **8 Fault Domains** | HTTP, Database, Message Queue, gRPC, Filesystem, Clock, Process, Resource pressure |
| **Search Strategies** | Random, UCB1, MCTS (tree-based), Bayesian Optimization — coverage-guided, not random monkey testing |
| **Deterministic Replay** | Every run carries a seed. Same seed + same schedule = same outcome, always |
| **AI Agent Suite** | Investigator (generates fault schedules from bug reports), Explainer (root-cause analysis), Patcher (generates fix PRs), Postmortem (writes incident reports) |
| **Distributed Execution** | BullMQ job queue → Docker-in-Docker sandboxed workers → fair-share multi-tenant scheduling |
| **Enterprise Ready** | RBAC, immutable audit logging, SAML/OIDC SSO, SCIM provisioning, SOC 2 evidence generation, self-hosted VPC deployment |
| **Full Observability** | OpenTelemetry traces, Prometheus metrics, Jaeger tracing, Grafana dashboards |

## Quickstart

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9.9
- **Docker** & **Docker Compose** (for workers and self-hosted deployment)
- **PostgreSQL** 15+ and **Redis** 7+ (or use the provided `docker-compose.yml`)

### Install & Build

```bash
git clone https://github.com/devprashant19/Sibyl.git
cd Sibyl
pnpm install
pnpm build
```

### Run the Development Stack

```bash
# Start infrastructure (Postgres + Redis)
docker-compose up -d

# Start the API server
cd packages/api && pnpm dev

# Start the dashboard
cd packages/dashboard && pnpm dev

# Start the worker daemon
cd packages/worker && pnpm dev
```

The dashboard is available at `http://localhost:3000` and the API at `http://localhost:4000`.

### Run Your First Simulation

```bash
# Using the CLI
npx sibyl run ./my-app --promise no-lost-updates --iterations 100

# Or programmatically with the Node SDK
```

```typescript
import { SearchOrchestrator } from '@sibyl/core';
import { definePromise } from '@sibyl/sdk';
import { HttpFaultDriver } from '@sibyl/fault-drivers/http';

const noDoubleCharges = definePromise({
  id: 'no-double-charges',
  name: 'No Double Charges',
  evaluate: async (ctx) => {
    const dupes = ctx.events.filter(e => e.domain === 'HTTP' && e.duplicate);
    return dupes.length === 0;
  }
});

const orchestrator = new SearchOrchestrator({
  workflow: async () => { /* your application code */ },
  templates: [{ domain: 'HTTP', type: 'TIMEOUT', probability: 0.3 }],
  promises: [noDoubleCharges],
  iterations: 500,
  seed: '0xDEADBEEF'
});

orchestrator.registerDriver(new HttpFaultDriver());
const results = await orchestrator.run();

console.log(`Found ${results.failures} failures in ${results.totalRuns} runs.`);
```

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   CLI / SDK  │───▶│   Core API   │───▶│  BullMQ Queue│
│  (sibyl run) │    │  (Express)   │    │  (Redis)     │
└──────────────┘    └──────┬───────┘    └──────┬───────┘
                           │                   │
                    ┌──────▼───────┐    ┌──────▼───────┐
                    │  Dashboard   │    │   Workers    │
                    │  (Next.js)   │    │  (BullMQ)    │
                    └──────────────┘    └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │   Sandboxes  │
                                        │  (Docker)    │
                                        └──────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed breakdown of every component.

## Packages

This is a **pnpm monorepo** managed by [Turborepo](https://turbo.build/). All packages live under `packages/`:

| Package | Description |
|---|---|
| [`packages/core`](./packages/core) | Simulation engine, PRNG, search strategies (MCTS, Bayesian, UCB1), promise evaluator, orchestrator |
| [`packages/api`](./packages/api) | Express REST API server — run management, project CRUD, SSE progress streaming |
| [`packages/worker`](./packages/worker) | BullMQ worker daemon — picks up simulation jobs, runs them in Docker sandboxes |
| [`packages/agent`](./packages/agent) | AI agent suite — Investigator, Explainer, Patcher, Postmortem (powered by Claude) |
| [`packages/cli`](./packages/cli) | `sibyl` CLI — `run`, `replay`, `ci`, `init`, `login` commands |
| [`packages/dashboard`](./packages/dashboard) | Next.js web dashboard — run viewer, project management, marketing landing page |
| [`packages/fault-drivers`](./packages/fault-drivers) | Fault injection drivers for all 8 domains (HTTP, DB, MQ, gRPC, FS, Clock, Process, Resource) |
| [`packages/sdk-node`](./packages/sdk-node) | Node.js/TypeScript SDK — `definePromise`, `install()`, fault driver auto-wiring |
| [`packages/sdk-python`](./packages/sdk-python) | Python SDK — `define_promise`, pytest integration |
| [`packages/sdk-java`](./packages/sdk-java) | Java SDK — JUnit 5 extension, Maven artifact |
| [`packages/sdk-go`](./packages/sdk-go) | Go SDK — `DefinePromise`, `testing.T` integration |
| [`packages/shared`](./packages/shared) | Shared TypeScript types, Zod schemas, database models |
| [`packages/ui`](./packages/ui) | Shared React component library (design system) |
| [`packages/integrations`](./packages/integrations) | CI/CD wrappers for GitHub Actions, GitLab CI, Jenkins, CircleCI |
| [`packages/vscode-extension`](./packages/vscode-extension) | VS Code extension — inline promise linting, run triggering, result viewing |
| [`infra`](./infra) | Infrastructure-as-code (Pulumi + Terraform) for cloud deployments |

## Self-Hosting

Sibyl is designed for deployment inside your own VPC. See [SELF_HOSTING.md](./SELF_HOSTING.md) for the full guide.

```bash
SIBYL_ENTERPRISE_SELF_HOSTED=true \
SIBYL_DISABLE_AI=true \
docker-compose up -d
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `SIBYL_ENTERPRISE_SELF_HOSTED` | `false` | Bypasses Stripe billing and disables telemetry |
| `SIBYL_DISABLE_AI` | `false` | Disables all LLM-powered agent features |
| `SIBYL_LOCAL_LLM_URL` | — | Optional local LLM endpoint for air-gapped AI |
| `ANTHROPIC_API_KEY` | — | Required for AI agent features |
| `STRIPE_SECRET_KEY` | — | Required for billing (cloud-hosted only) |
| `WORKER_CONCURRENCY` | `5` | Number of concurrent sandbox workers |

## Testing

```bash
# Run all tests across the monorepo
pnpm test

# Run the deterministic bug-suite regression tests
cd packages/core && pnpm test -- --grep "bug-suite"

# Run the load-testing suite
npx tsx packages/core/test/load-test.ts
```

## Documentation

Full documentation is available in the [`docs/`](./docs) directory, built with [Mintlify](https://mintlify.com):

- **SDK Quickstarts** — Node, Python, Java, Go
- **Concepts** — Promises, fault schedules, determinism explained
- **API Reference** — Every endpoint and Zod schema
- **CLI Reference** — Every `sibyl` command
- **Deep Dives** — How the search algorithms work, benchmarks & scalability

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on development workflow, code style, testing, and submitting pull requests.

## Security

See [SECURITY.md](./SECURITY.md) for our security policy, responsible disclosure process, and information about the audit log, RBAC, and SSO features.

## License

Proprietary. See [LICENSE](./LICENSE) for details.
