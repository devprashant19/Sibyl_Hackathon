# @sibyl/core

The simulation engine, search orchestrator, and all core platform subsystems.

## Overview

This is the central package of the Sibyl monorepo. It contains the deterministic simulation engine, the pluggable search strategies, the promise evaluation system, and the platform infrastructure (billing, auth, audit, telemetry).

## Module Map

```
src/
├── engine.ts          # SimulationEngine — runs a single simulation with seeded fault injection
├── orchestrator.ts    # SearchOrchestrator — runs N iterations with strategy-guided schedule selection
├── promise.ts         # Promise system — definePromise, evaluate, allOf/anyOf combinators
├── prng.ts            # PRNG — Mulberry32 seeded generator with deterministic forking
├── clock.ts           # VirtualClock — intercepts Date.now/setTimeout for time control
├── driver.ts          # FaultDriver interface — the contract all fault drivers implement
├── async-context.ts   # AsyncLocalStorage wrapper for concurrent run isolation
├── calendar.ts        # Chaos calendar — scheduled fault injection windows
├── github-app.ts      # GitHub App integration for PR-level chaos reports
├── index.ts           # Public API barrel export
│
├── search/            # Pluggable search strategies
│   ├── strategy.ts    # SearchStrategy interface
│   ├── ucb1.ts        # UCB1 multi-armed bandit
│   ├── mcts.ts        # Monte Carlo Tree Search
│   └── bayesian.ts    # Bayesian Optimization
│
├── sandbox/           # Docker-in-Docker sandbox provider
│   └── provider.ts    # SandboxProvider interface + DockerSandboxProvider
│
├── queue/             # BullMQ job definitions and queue configuration
│
├── db/                # Database schema, migrations, and query helpers
│
├── billing/           # Stripe integration and plan enforcement
│   ├── tiers.ts       # Plan definitions (Seer, Oracle, Pythia)
│   ├── limits.ts      # Rate limiting and quota enforcement
│   ├── metering.ts    # Usage-based metering (sandbox-minutes)
│   ├── stripe.ts      # Stripe API integration
│   └── enforcement.ts # Middleware for plan-based access control
│
├── auth/              # Authentication, RBAC, SSO
│   ├── rbac.ts        # Role definitions (Owner, Admin, Member, Viewer)
│   └── sso/           # SAML/OIDC via @boxyhq/saml-jackson, SCIM provisioning
│
├── audit/             # Security audit infrastructure
│   ├── logger.ts      # AuditLogger — immutable, append-only event log
│   └── compliance.ts  # SOC 2 evidence report generator
│
├── telemetry/         # OpenTelemetry instrumentation
│   └── index.ts       # Trace/metric initialization and span helpers
│
├── api/               # Zod schemas for API request/response validation
│
└── importers/         # Config file importers (sibyl.config.ts → runtime config)
```

## Key Concepts

### SimulationEngine

A single run's execution context. It owns a seeded PRNG, a VirtualClock, and a set of installed FaultDrivers. When a driver intercepts an I/O operation, it calls `evaluateFaultDecision()` on the engine, which:

1. Finds matching fault schedules for the target domain
2. Checks time windows and target metadata filters
3. Rolls the domain-specific PRNG fork
4. Returns a `FaultSpec` if the roll hits, or `null` to pass through

### SearchOrchestrator

Runs N iterations of the engine, each with a schedule selected by the active `SearchStrategy`. Supports:

- **Concurrent execution** via `AsyncLocalStorage` — multiple runs share globally-installed drivers but each resolves to its own engine instance.
- **Early exit** — stops immediately when the first promise violation is found.
- **Sandbox execution** — delegates runs to Docker containers via `SandboxProvider`.
- **Strategy feedback** — reports results back to the strategy for learning.

### PRNG

Mulberry32 generator seeded via FNV-1a hash. Key property: **deterministic forking**. Calling `prng.fork('http')` produces a child PRNG that is:
- Reproducible from the parent seed + namespace
- Independent of the parent's consumption state (order-independent)
- Unique per namespace

This ensures that adding a new fault domain doesn't change the random sequences of existing domains.

## Usage

```typescript
import { SearchOrchestrator, SearchConfig } from '@sibyl/core';
import { definePromise } from '@sibyl/core/promise';

const config: SearchConfig = {
  workflow: async () => { /* your app code */ },
  templates: [/* fault schedule templates */],
  promises: [/* your promise definitions */],
  iterations: 500,
  seed: '0xDEADBEEF',
  concurrency: 4,
  earlyExit: true
};

const orchestrator = new SearchOrchestrator(config);
const result = await orchestrator.run();
```

## Testing

```bash
pnpm test              # Unit tests
pnpm test -- --watch   # Watch mode
```

The `examples/bug-suite/` directory contains deterministic regression tests for the search engine. See `examples/bug-suite/runner.test.ts`.
