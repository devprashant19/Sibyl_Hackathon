# @sibyl/cli

The `sibyl` command-line interface.

## Overview

A Commander.js-based CLI that provides the primary developer interface for running simulations, replaying failures, integrating with CI, and managing Sibyl projects.

## Commands

### `sibyl run <target>`

Run a simulation against a target application.

```bash
sibyl run ./my-app \
  --promise no-double-charges \
  --iterations 500 \
  --strategy mcts \
  --seed 0xDEADBEEF \
  --concurrency 4 \
  --early-exit
```

| Flag | Default | Description |
|---|---|---|
| `--promise, -p` | all | Specific promise(s) to check |
| `--iterations, -n` | `100` | Number of simulation iterations |
| `--strategy, -s` | `mcts` | Search strategy: `random`, `ucb1`, `mcts`, `bayesian` |
| `--seed` | random | Master seed for deterministic replay |
| `--concurrency, -c` | `1` | Parallel simulation workers |
| `--early-exit` | `false` | Stop on first promise violation |
| `--config` | `./sibyl.config.ts` | Path to config file |
| `--faults` | all | Specific fault domains to enable |

### `sibyl replay <seed>`

Replay a previously-discovered failure using its exact seed and schedule.

```bash
sibyl replay 0x8f2c --run-id 01JD4KQ8
```

### `sibyl ci`

CI-optimized mode. Runs simulations and exits with a non-zero code if any promise is violated. Designed for use in GitHub Actions, GitLab CI, Jenkins, and CircleCI pipelines.

```bash
sibyl ci ./my-app --promise no-lost-updates --budget 200
```

| Flag | Description |
|---|---|
| `--budget` | Maximum iterations before declaring "pass" |
| `--junit-output` | Path to write JUnit XML results |
| `--github-comment` | Post results as a GitHub PR comment |

### `sibyl init`

Initialize a new Sibyl project. Creates a `sibyl.config.ts` template.

```bash
sibyl init
```

### `sibyl login`

Authenticate with the Sibyl platform API.

```bash
sibyl login --api-key sk_live_...
```

## Configuration File

The CLI reads `sibyl.config.ts` (or the path specified by `--config`) at startup. This file exports promise definitions and default run configuration.

```typescript
// sibyl.config.ts
import { definePromise } from '@sibyl/sdk';

export const noDoubleCharges = definePromise({
  id: 'no-double-charges',
  name: 'No Double Charges',
  evaluate: async (ctx) => {
    // ...
  }
});
```

## Development

```bash
# Build
pnpm build

# Run locally
node dist/index.js run ./target --iterations 10

# Or via the bin entry
npx sibyl run ./target
```

## Module Map

```
src/
└── index.ts    # Commander.js command definitions and execution logic
bin/
└── sibyl       # Executable entry point
```
