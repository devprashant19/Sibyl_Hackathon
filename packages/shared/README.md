# @sibyl/shared

Shared TypeScript types, Zod schemas, and database models used across the Sibyl monorepo.

## Overview

This package is the **single source of truth** for all cross-package type definitions. Every other package in the monorepo depends on `@sibyl-shared` for runtime-validated schemas and TypeScript types.

## What's Inside

### Zod Schemas

Runtime validation schemas for all API payloads, fault specifications, and database records. TypeScript types are derived from these schemas using `z.infer<>`, ensuring compile-time and runtime types always agree.

### Core Types

| Type | Description |
|---|---|
| `FaultDomain` | Union: `'HTTP' \| 'DATABASE' \| 'MESSAGE_QUEUE' \| 'GRPC' \| 'FILESYSTEM' \| 'CLOCK' \| 'PROCESS' \| 'RESOURCE'` |
| `FaultSpec` | Discriminated union describing a specific fault to inject |
| `FaultSchedule` | A concrete fault schedule: domain + spec + probability + target filter + time window |
| `FaultScheduleTemplate` | An abstract template that the search strategy concretizes per-iteration |
| `SimulationRun` | A single run record: id, environment, status, schedules |
| `CapturedEvent` | A single intercepted I/O operation: domain, type, metadata, timestamp |
| `PromiseResult` | The result of evaluating a promise: passed/failed, severity, message, evidence |
| `PromiseSeverity` | `'CRITICAL' \| 'WARNING' \| 'INFO'` |

### Database Models

Drizzle ORM or raw SQL model definitions for PostgreSQL tables including `simulation_runs`, `captured_events`, `promise_results`, `projects`, `organizations`, `api_keys`, `audit_log`, and `users`.

## Usage

```typescript
import { SimulationRun, FaultDomain, CapturedEvent, PromiseResult } from '@sibyl-shared';
```

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run schema validation tests
```
