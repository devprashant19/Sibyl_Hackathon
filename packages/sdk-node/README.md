# @sibyl/sdk-node

The official Node.js / TypeScript SDK for the Sibyl chaos engineering platform.

## Installation

```bash
npm install @sibyl/sdk
# or
pnpm add @sibyl/sdk
```

## Quickstart

```typescript
import { definePromise, install } from '@sibyl/sdk';

// 1. Define a promise — the business invariant your system must uphold
const noDoubleCharges = definePromise({
  id: 'no-double-charges',
  name: 'No Double Charges',
  severity: 'CRITICAL',
  evaluate: async (ctx) => {
    const charges = ctx.timeline(e => e.domain === 'HTTP' && e.metadata?.path === '/v1/charges');
    const uniqueIdempotencyKeys = new Set(charges.map(e => e.metadata?.idempotencyKey));
    
    if (charges.length !== uniqueIdempotencyKeys.size) {
      return { passed: false, message: 'Duplicate charge detected' };
    }
    return { passed: true };
  }
});

// 2. Install fault drivers (auto-detects your HTTP client, DB driver, etc.)
install();

// 3. Export for the CLI or orchestrator to discover
export default [noDoubleCharges];
```

## API

### `definePromise(config)`

Creates a type-safe promise definition.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier |
| `name` | `string` | Human-readable name |
| `severity` | `'CRITICAL' \| 'WARNING' \| 'INFO'` | Failure severity |
| `evaluate` | `(ctx: PromiseContext) => EvaluationResult \| boolean` | Evaluation function |

### `install(options?)`

Auto-wires fault drivers for detected I/O libraries (fetch, pg, mysql2, kafkajs, etc.).

| Option | Default | Description |
|---|---|---|
| `domains` | all detected | Specific fault domains to enable |
| `exclude` | `[]` | Domains to exclude |

### `PromiseContext`

Provided to every `evaluate` function:

| Property | Type | Description |
|---|---|---|
| `runId` | `string` | Current simulation run ID |
| `events` | `CapturedEvent[]` | All captured events from this run |
| `timeline(filter?)` | `CapturedEvent[]` | Events sorted chronologically, optionally filtered |

### Combinators

```typescript
import { allOf, anyOf } from '@sibyl/sdk';

const allInvariants = allOf('all-invariants', 'All business rules', [
  noDoubleCharges,
  everyChargeGetsAReceipt,
  noOrphanedRecords
]);
```

## Framework Integrations

### Vitest / Jest

```typescript
import { describe, it, expect } from 'vitest';
import { SearchOrchestrator } from '@sibyl/core';

describe('checkout service', () => {
  it('should not double-charge under network faults', async () => {
    const result = await new SearchOrchestrator({
      workflow: () => import('./checkout'),
      promises: [noDoubleCharges],
      iterations: 100,
      seed: '0xTEST'
    }).run();

    expect(result.failures).toBe(0);
  });
});
```

## Examples

See `examples/quickstart/` for a complete working example.
