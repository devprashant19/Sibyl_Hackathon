# Sibyl Go SDK Quickstart

This example demonstrates how to integrate Sibyl into a standard `net/http` and `database/sql` Go application.

## 1. The Application Bug
In `main.go`, we have an endpoint `POST /api/checkout`. 
It reads the inventory, verifies there is stock, and then writes the new stock. Because it doesn't use a transaction with `SELECT ... FOR UPDATE`, it is vulnerable to a classic TOCTOU race condition.

## 2. Integration (Explicit Wrapping)
Unlike dynamic languages, Go prefers explicit wrapping. 
To intercept the database, we register Sibyl's driver wrapper over the `pq` Postgres driver:
```go
sql.Register("sibyl-postgres", sibyl.WrapDriver(&pq.Driver{}))
db, _ = sql.Open("sibyl-postgres", "user=postgres password=password dbname=quickstart")
```
For HTTP, you would wrap `http.DefaultTransport` using `sibyl.NewTransport(http.DefaultTransport)`.

## 3. The Promise
In `sibyl_config.go`, we use the idiomatic Go `sibyl.Promise` struct to declare our invariant without heavy boilerplate interfaces:
```go
var NoNegativeInventory = sibyl.Promise{
	ID:          "no-negative-inventory",
	Severity:    "CRITICAL",
	Check: func(ctx sibyl.PromiseContext) bool {
		// filter timeline and ensure no inventory drops below 0
	},
}
```

## 4. Running the Simulation
```bash
go mod tidy
# (Assuming Sibyl Orchestrator invokes Go)
sibyl run --target sibyl_config.go --local-only
```
Sibyl injects a `SLOW_IO` delay between the `SELECT` and `UPDATE`, predictably failing the test by causing negative inventory!
