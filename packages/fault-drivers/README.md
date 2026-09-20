# @sibyl/fault-drivers

Fault injection drivers for all eight supported fault domains.

## Overview

Each fault driver implements the `FaultDriver` interface from `@sibyl/core`. A driver's job is to:

1. **Intercept** I/O operations in the target application (HTTP calls, database queries, message queue operations, etc.).
2. **Consult** the simulation engine via `context.getFaultDecision()` to determine whether a fault should be injected.
3. **Record** every intercepted operation (faulted or not) via `context.recordEvent()` for the captured event timeline.
4. **Restore** original behavior cleanly when `uninstall()` is called.

## Supported Domains

| Directory | Domain | What It Intercepts | Example Faults |
|---|---|---|---|
| `http/` | `HTTP` | `fetch`, `http.request`, Axios interceptors | Connection timeout, 5xx responses, slow responses, dropped connections, DNS failures |
| `db/` | `DATABASE` | `pg`, `mysql2`, Prisma query engine | Query timeout, deadlock, connection drop mid-query, partial commit |
| `mq/` | `MESSAGE_QUEUE` | KafkaJS consumer, SQS `receiveMessage` | Duplicate delivery, message loss, out-of-order delivery, consumer crash mid-processing |
| `grpc/` | `GRPC` | `@grpc/grpc-js` client interceptors | `DEADLINE_EXCEEDED`, `UNAVAILABLE`, `RESOURCE_EXHAUSTED` |
| `filesystem/` | `FILESYSTEM` | `fs.readFile`, `fs.writeFile`, `fs.mkdir` | Disk full (`ENOSPC`), slow I/O, permission denied (`EACCES`), torn/partial writes |
| `clock/` | `CLOCK` | `Date.now`, `setTimeout`, `setInterval` | Clock skew (±seconds to ±hours), time jumps, frozen time |
| `process/` | `PROCESS` | Child process lifecycle | SIGTERM, SIGKILL, OOM-kill simulation mid-operation |
| `resource/` | `RESOURCE` | Memory/CPU allocation patterns | Memory pressure, CPU starvation, connection pool exhaustion |

## Driver Interface

Every driver implements this interface from `packages/core/src/driver.ts`:

```typescript
interface FaultDriver {
  domain: FaultDomain;
  install(context: DriverContext): void;
  uninstall(): void;
}

interface DriverContext {
  clock: VirtualClock;
  getFaultDecision: (domain: FaultDomain, targetMetadata: Record<string, any>) => FaultSpec | null;
  recordEvent: (event: Omit<CapturedEvent, 'id' | 'timestamp'>) => void;
}
```

## Target Metadata

Each driver passes **target metadata** to `getFaultDecision()` so the engine can match fault schedules precisely. Examples:

- **HTTP**: `{ method: 'POST', url: 'https://api.stripe.com/v1/charges', host: 'api.stripe.com' }`
- **Database**: `{ operation: 'query', table: 'charges', queryText: 'INSERT INTO charges...' }`
- **MQ**: `{ topic: 'orders', partition: 0, operation: 'consume' }`

This allows fault schedules to target specific endpoints, tables, or topics rather than faulting all I/O indiscriminately.

## Adding a New Driver

See [CONTRIBUTING.md](../../CONTRIBUTING.md#adding-a-new-fault-driver) for the full guide on implementing a new fault driver.
