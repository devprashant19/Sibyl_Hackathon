# sibyl (Go) — experimental

Early building blocks for a Go SDK. **There is no Go orchestrator yet**: nothing here runs a
search, evaluates promises, or talks to the Sibyl API, and the `sibyl` CLI cannot run Go code.

What exists (`github.com/devprashant19/Sibyl/packages/sdk-go/sibyl`, no third-party dependencies):

- `sibyl.WrapDriver(driver.Driver)` — wraps a `database/sql` driver. `sibyl.BeforeExec`, when set,
  runs before every statement execution and can delay it or return an error (fault injection hook).
- `sibyl.NewTransport(http.RoundTripper)` — pass-through `http.RoundTripper` wrapper (no faults yet).
- `sibyl.Clock`, `sibyl.Now()`, `sibyl.Sleep(ctx, d)` — an injectable clock (`sibyl.ActiveClock`).
- `sibyl.Promise`, `sibyl.Event`, `sibyl.PromiseContext` — types describing promises over captured events.

```bash
go vet ./... && go build ./...
```

`examples/quickstart` is a separate module (it depends on `github.com/lib/pq` and uses a `replace`
directive to point at this directory):

```bash
cd examples/quickstart && go vet ./... && go build ./...
```
