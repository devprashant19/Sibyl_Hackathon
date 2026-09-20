# sibyl-sdk (Go)

The official Go SDK for the Sibyl chaos engineering platform.

## Installation

```bash
go get github.com/devprashant19/sibyl-go
```

## Quickstart

```go
package main

import (
    "testing"
    sibyl "github.com/devprashant19/sibyl-go/sibyl"
)

func TestNoDoubleCharges(t *testing.T) {
    promise := sibyl.DefinePromise(sibyl.PromiseConfig{
        ID:       "no-double-charges",
        Name:     "No Double Charges",
        Severity: sibyl.Critical,
        Evaluate: func(ctx *sibyl.PromiseContext) sibyl.PromiseResult {
            charges := ctx.Timeline(func(e sibyl.CapturedEvent) bool {
                return e.Domain == "HTTP" && e.Metadata["path"] == "/v1/charges"
            })

            seen := make(map[string]bool)
            for _, c := range charges {
                key := c.Metadata["idempotencyKey"]
                if seen[key] {
                    return sibyl.Fail("Duplicate charge detected for key: " + key)
                }
                seen[key] = true
            }
            return sibyl.Pass()
        },
    })

    result := sibyl.Run(sibyl.RunConfig{
        Workflow:   func() { processPayment("order-123", 49.99) },
        Promises:   []sibyl.Promise{promise},
        Iterations: 100,
        Seed:       "0xBEEF",
        Strategy:   sibyl.MCTS,
    })

    if result.Failures > 0 {
        t.Fatalf("Found %d failures in %d runs", result.Failures, result.TotalRuns)
    }
}
```

## `testing.T` Integration

The Go SDK integrates directly with Go's built-in testing package:

```go
func TestWithSibyl(t *testing.T) {
    sibyl.RunTest(t, sibyl.TestConfig{
        Iterations: 200,
        Seed:       "0xDEAD",
        Promises:   []sibyl.Promise{noDoubleCharges, noOrphanedRecords},
        Workflow:   myAppWorkflow,
    })
}
```

Run with:
```bash
go test -v -run TestWithSibyl
```

## API

### `sibyl.DefinePromise(config)`

Creates a promise definition.

### `sibyl.Run(config)`

Runs the simulation orchestrator and returns results.

### `sibyl.Install()`

Auto-wires fault drivers for `net/http`, `database/sql`, and Sarama (Kafka).

## Examples

See `examples/quickstart/` for a complete working example with `net/http` and `database/sql`.
