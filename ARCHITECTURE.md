# Architecture

This document describes the high-level architecture of the Sibyl chaos engineering platform. It is intended for contributors, enterprise integrators, and anyone who wants to understand how the system works internally.

## Design Principles

1. **Determinism over randomness.** Every simulation run is governed by a seeded PRNG. Given the same seed and the same fault schedule, the engine makes the exact same decisions in the exact same order. This is what makes failures reproducible on demand.

2. **Application-layer fidelity.** Sibyl instruments your application's actual I/O boundaries (HTTP clients, database drivers, message queue consumers) rather than operating at the infrastructure layer (killing pods, injecting network partitions at the TCP level). This catches the bugs that live in *your code's error handling*, not in Kubernetes' self-healing.

3. **Separation of search and execution.** The search algorithm (which fault schedule to try next) is decoupled from execution (running the workflow under that schedule). This allows pluggable strategies and distributed execution without changing the core engine.

4. **Zero-trust multi-tenancy.** Every simulation run executes inside a Docker-in-Docker sandbox with its own network namespace. Cross-run event leakage is structurally impossible.

## System Overview

```
                                  ┌─────────────────────────────────┐
                                  │         Client Layer            │
                                  │  CLI · SDKs · Dashboard · API   │
                                  └────────────┬────────────────────┘
                                               │
                                  ┌────────────▼────────────────────┐
                                  │         Core API (Express)      │
                                  │  REST endpoints · SSE streams   │
                                  │  Auth · RBAC · Audit · Billing  │
                                  └────────────┬────────────────────┘
                                               │
                              ┌────────────────┼────────────────────┐
                              │                │                    │
                    ┌─────────▼──────┐  ┌──────▼───────┐  ┌────────▼────────┐
                    │  PostgreSQL    │  │   Redis      │  │  BullMQ Queue   │
                    │  (persistent)  │  │  (cache/pub) │  │  (job dispatch) │
                    └────────────────┘  └──────────────┘  └────────┬────────┘
                                                                   │
                                                          ┌────────▼────────┐
                                                          │  Worker Fleet   │
                                                          │  (BullMQ)       │
                                                          └────────┬────────┘
                                                                   │
                                                          ┌────────▼────────┐
                                                          │  Docker Sandbox │
                                                          │  (per run)      │
                                                          └─────────────────┘
```

## Component Deep Dives

### Core Engine (`packages/core/src/engine.ts`)

The `SimulationEngine` is the heart of a single run. It owns:

- **A seeded PRNG** (`packages/core/src/prng.ts`) — Mulberry32 generator seeded via FNV-1a hash. Supports deterministic forking by namespace so that each fault domain gets an independent, reproducible random stream.
- **A VirtualClock** (`packages/core/src/clock.ts`) — Intercepts `Date.now()` and `setTimeout`/`setInterval` to allow time acceleration and clock-skew injection without waiting real wall-clock time.
- **Fault Drivers** — Pluggable interceptors for each I/O domain. Each driver calls `getFaultDecision()` on every intercepted operation. The engine evaluates the active fault schedule, rolls the domain-specific PRNG, and returns a `FaultSpec` (or `null` for "no fault").
- **Event Capture** — Every intercepted operation (faulted or not) is recorded as a `CapturedEvent` with a virtual timestamp, forming the event timeline that promise evaluation and AI analysis operate on.

### Search Orchestrator (`packages/core/src/orchestrator.ts`)

The `SearchOrchestrator` runs N iterations of the engine, each with a different fault schedule selected by the active `SearchStrategy`:

| Strategy | File | Approach |
|---|---|---|
| **UCB1** | `search/ucb1.ts` | Multi-armed bandit — balances exploration vs exploitation across schedule arms |
| **MCTS** | `search/mcts.ts` | Monte Carlo Tree Search — builds a game tree over fault decisions, backpropagates failure signals |
| **Bayesian** | `search/bayesian.ts` | Bayesian optimization — models the failure probability surface, uses acquisition functions to pick schedules |
| **Random** | (default fallback) | Uniform random schedule generation — baseline for comparison |

The orchestrator uses `AsyncLocalStorage` to run concurrent iterations safely — each async context carries its own engine instance, so fault drivers installed globally can resolve the correct engine per-request.

### Promise System (`packages/core/src/promise.ts`)

Promises are the invariants that Sibyl checks after each run. They are defined in user code using `definePromise()` and evaluated against the captured event timeline.

- `ProgrammaticPromise` — The interface. Has `id`, `description`, `severity`, and an `evaluate(ctx)` function.
- `PromiseContext` — Provides the `runId`, the full `events` array, and a `timeline()` helper that returns events sorted chronologically with optional filtering.
- `allOf()` / `anyOf()` — Combinators for composing promises.

### Fault Drivers (`packages/fault-drivers/`)

Each fault domain has a dedicated driver package:

| Domain | What It Intercepts | Example Faults |
|---|---|---|
| `http` | `fetch`, `http.request`, Axios | Timeouts, 5xx, dropped connections, slow responses |
| `db` | `pg`, `mysql2`, Prisma query engine | Deadlocks, connection drops, partial commits |
| `mq` | KafkaJS consumer, SQS `receiveMessage` | Duplicate delivery, message loss, out-of-order |
| `grpc` | `@grpc/grpc-js` client calls | `DEADLINE_EXCEEDED`, `UNAVAILABLE`, `RESOURCE_EXHAUSTED` |
| `filesystem` | `fs.readFile`, `fs.writeFile` | Disk full, slow I/O, permission denied, torn writes |
| `clock` | `Date.now`, `setTimeout`, `setInterval` | Clock skew, time jumps |
| `process` | Child process management | SIGTERM, SIGKILL, OOM kill simulation |
| `resource` | Memory/CPU allocation | Memory pressure, CPU starvation |

### Worker (`packages/worker/`)

A BullMQ worker daemon that:
1. Pulls `SimulationRunJob` messages from the `simulation-run-queue`.
2. Creates an isolated Docker sandbox for each run.
3. Mounts the target application and executes it inside the sandbox.
4. Publishes progress events via Redis pub/sub for SSE streaming.
5. Reports usage metrics (sandbox-minutes) to the billing engine.

Workers support **round-robin fair-share scheduling** by `orgId`, ensuring one tenant's large batch doesn't starve another tenant's CI-critical runs.

### AI Agent Suite (`packages/agent/`)

Four specialized agents powered by Claude (Anthropic):

| Agent | Purpose |
|---|---|
| **Investigator** | Takes a natural-language bug report, fetches existing promises and recent events via tool calls, generates a concrete `FaultSchedule` to reproduce the bug |
| **Explainer** | Analyzes a failed run's event timeline and produces a plain-language root-cause explanation grounded in the evidence |
| **Patcher** | Reads the Explainer's analysis plus the relevant source code, generates a code fix |
| **Postmortem** | Produces a structured incident report (timeline, root cause, impact, remediation) from a failed run |

All agents respect the `SIBYL_DISABLE_AI=true` flag — they throw an explicit error rather than silently degrading.

### Dashboard (`packages/dashboard/`)

A Next.js application with two faces:

1. **Public routes** (`/`) — The marketing landing page (Appendix A reference implementation) with tab-style navigation, live-typing oracle console, fault domain grid, pricing tiers, and a gated demo.
2. **Authenticated routes** (`/runs`, `/projects`, `/settings`) — The operational dashboard for viewing simulation runs, managing projects, configuring promises, and viewing audit logs.

### Billing (`packages/core/src/billing/`)

Three-tier pricing model:

| Tier | Price | Limits |
|---|---|---|
| **Seer** (Free) | $0 | 1 project, 50K runs/month, 7-day retention |
| **Oracle** | $99/service/mo | Unlimited projects/runs, 30-day retention, MCTS search, integrations |
| **Pythia** (Enterprise) | Custom | Self-hosted, SSO/SCIM, custom retention, audit logs, compliance reports |

The billing engine integrates with Stripe for subscription management and usage-based metering. Self-hosted deployments (`SIBYL_ENTERPRISE_SELF_HOSTED=true`) bypass billing entirely.

### Auth, RBAC & Audit

- **Authentication** — Session-based auth with SAML 2.0 and OIDC SSO via `@boxyhq/saml-jackson` for Enterprise tier.
- **RBAC** — Four roles: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`. Enforced at the API middleware level.
- **SCIM** — Automated user provisioning/deprovisioning from enterprise identity providers.
- **Audit Log** — Immutable, append-only log of every security-relevant action (API key created, promise modified, project deleted, etc.). Viewable by org admins.
- **Compliance** — SOC 2 evidence report generator exports RBAC config, audit log completeness, and data-retention enforcement.

### Observability (`packages/core/src/telemetry/`)

Full OpenTelemetry instrumentation:

- **Traces** — Every run lifecycle: `queued → sandboxed → executed → results_ingested`
- **Metrics** — Queue depth, sandbox cold-start latency, search session duration, agent call latency/cost
- **Export targets** — Prometheus (metrics), Jaeger (traces), Grafana (dashboards)

The observability stack is defined in `docker-compose.observability.yml`.

## Data Flow: A Single Simulation Run

```
1. User runs `sibyl run ./app --promise no-lost-updates --iterations 100 --seed 0xBEEF`
2. CLI parses args, loads sibyl.config.ts, resolves promise definitions
3. CLI calls POST /api/v1/search-sessions with schedule templates + promises
4. API enqueues 100 SimulationRunJob messages to BullMQ (one per iteration)
5. Worker picks up a job, creates a Docker sandbox
6. Inside sandbox: Engine installs fault drivers, runs the workflow
7. Fault drivers intercept I/O → call getFaultDecision() → PRNG roll → inject or pass-through
8. Every operation recorded as CapturedEvent
9. Workflow completes (or crashes) → Engine stops → Promises evaluated
10. Results written to PostgreSQL → Progress published via Redis pub/sub
11. Strategy receives feedback → selects next schedule
12. Repeat for all 100 iterations
13. CLI prints summary → worst-run details → seed for replay
```

## Directory Structure

```
sibyl/
├── packages/
│   ├── core/          # Engine, PRNG, search, promises, billing, auth, audit, telemetry
│   ├── api/           # Express REST API
│   ├── worker/        # BullMQ worker daemon
│   ├── agent/         # AI agent suite (Investigator, Explainer, Patcher, Postmortem)
│   ├── cli/           # `sibyl` CLI (Commander.js)
│   ├── dashboard/     # Next.js web UI + marketing page
│   ├── fault-drivers/ # Fault injection drivers (http, db, mq, grpc, fs, clock, process, resource)
│   ├── sdk-node/      # Node.js SDK
│   ├── sdk-python/    # Python SDK
│   ├── sdk-java/      # Java SDK
│   ├── sdk-go/        # Go SDK
│   ├── shared/        # Shared types, Zod schemas, DB models
│   ├── ui/            # React component library
│   ├── integrations/  # CI/CD wrappers (GitHub Actions, GitLab, Jenkins, CircleCI)
│   └── vscode-extension/ # VS Code extension
├── infra/             # Pulumi + Terraform IaC
├── docs/              # Mintlify documentation site
├── sibyl.config.ts    # Dogfooding: Sibyl's own SLO promises
├── docker-compose.yml # Self-hosted deployment stack
└── turbo.json         # Turborepo pipeline configuration
```
