# @sibyl/worker

The distributed simulation worker daemon.

## Overview

A long-running BullMQ worker process that consumes `SimulationRunJob` messages from the `simulation-run-queue` Redis queue. Each job is executed inside an isolated Docker-in-Docker sandbox to prevent cross-run interference and guarantee tenant data isolation.

## How It Works

```
1. Worker pulls a SimulationRunJob from BullMQ
2. Creates a Docker sandbox (isolated network namespace, capped memory/CPU)
3. Mounts the target application inside the sandbox
4. Executes the simulation: engine installs drivers → workflow runs → events captured
5. Reports progress via Redis pub/sub (for SSE streaming to the dashboard)
6. Writes results to PostgreSQL
7. Reports usage metrics (sandbox-minutes) to the billing engine
8. Cleans up the sandbox container
```

## Multi-Tenant Fair Scheduling

Workers support **round-robin fair-share scheduling** by `orgId`. This means:

- If Org A submits 10,000 runs and Org B submits 10 runs, Org B's runs are interleaved fairly.
- No single tenant can starve another tenant's CI pipeline.
- This is critical for shared-infrastructure deployments (Oracle tier).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection for BullMQ |
| `WORKER_CONCURRENCY` | `5` | Maximum concurrent sandbox executions |
| `DATABASE_URL` | — | PostgreSQL for result persistence |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker daemon socket path |

## Autoscaling

The worker fleet is designed to scale horizontally. In Kubernetes deployments, the recommended autoscaling signal is the `sibyl.queue.depth` Prometheus metric exported via OpenTelemetry.

When queue depth exceeds a configurable threshold, the Horizontal Pod Autoscaler spins up additional worker pods. When the queue is empty, the fleet scales down to zero.

## Development

```bash
pnpm dev    # Start with hot-reload
pnpm build  # Compile TypeScript
```

## Module Map

```
src/
└── index.ts    # Worker daemon — BullMQ consumer, sandbox lifecycle, billing metering
```
