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
In `sibyl_config.go` (same `main` package), we use the idiomatic Go `sibyl.Promise` struct to declare our invariant without heavy boilerplate interfaces:
```go
var NoNegativeInventory = sibyl.Promise{
	ID:          "no-negative-inventory",
	Severity:    "CRITICAL",
	Check: func(ctx sibyl.PromiseContext) bool {
		// filter timeline and ensure no inventory drops below 0
	},
}
```

## 4. Running

There is no Go orchestrator yet, so the `sibyl` CLI cannot run this example and `NoNegativeInventory`
is not evaluated by anything. You can run the server with the fault hook enabled by hand:

```bash
go run .                      # needs a local Postgres with a products table
SIBYL_SLOW_IO=1 go run .      # delays every `UPDATE products` by 150ms via sibyl.BeforeExec
```

Concurrent checkouts against the slowed server then overwrite each other's inventory updates.
