# Sibyl documentation

Five documents in this folder, plus three at the root. The root ones explain how Sibyl works and how
to judge it; the ones here are reference.

| # | Document | What it covers |
|---|---|---|
| 1 | [Architecture](../ARCHITECTURE.md) | Topology, every component, sequence diagrams for run / fault decision / upload / replay, state, security, verification matrix |
| 2 | [CLI](cli.md) | Every command and option, exit codes, what replay compares |
| 3 | [Configuration](configuration.md) | The `sibyl.config.ts` format, templates and fault types, promises, drivers, every environment variable, every file written |
| 4 | [REST API](api.md) | Every route, request and response shape, errors, SSE, webhooks, retention |
| 5 | [Development](development.md) | Repository layout, scripts, test suites, how to add a driver or strategy, the invariants |

## Start here instead

- **Evaluating this?** → [`TESTING.md`](../TESTING.md): run `pnpm smoke`, then drive it yourself.
- **Just want to know what it is?** → [`README.md`](../README.md).
- **Changing the code?** → [`CLAUDE.md`](../CLAUDE.md) lists the invariants that are easy to break.

## The Mintlify site

The `.mdx` files and `mint.json` in this folder are the public documentation site. They are shorter and
point here for detail; where the two disagree, these Markdown files and the code are right.
