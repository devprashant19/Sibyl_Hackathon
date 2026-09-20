# Security Policy

## Reporting a vulnerability

Please do not open a public issue. Email the maintainer listed on the repository with a description,
steps to reproduce, and the affected commit. Expect an acknowledgement within a few days; this is a
small project, not a staffed security team.

Only the latest `main` is supported.

## What Sibyl does that has security consequences

Sibyl's main path is a CLI that **executes your `sibyl.config.ts`** and **patches I/O globals in its own
process** to inject faults, plus an optional API that **stores captured events**. Each has a consequence:

| Behaviour | Consequence | What to do |
|---|---|---|
| `sibyl run` imports and runs the config file | A config is code with your privileges | Review configs like scripts |
| The HTTP driver patches `fetch` / `http.request` for the session | Every request in that process can be faulted | Run against a test process, never production |
| Failing runs store their captured events, which include request URLs and whatever drivers record | Sessions can contain sensitive data | Don't point Sibyl at systems holding real customer data; control who can read the API |
| `sibyl explain` / `investigate` / `retro` send events, schedules and (with `--suggest-fix`) source files to Anthropic | Data leaves your machine | Leave `ANTHROPIC_API_KEY` unset, or set `SIBYL_DISABLE_AI=1` |

## Controls that exist

### API (`packages/api`)

- **Write authentication.** With `SIBYL_API_TOKEN` set, every `POST` requires `Authorization: Bearer
  <token>`, compared in constant time over SHA-256 digests.
- **Loopback by default.** Binds `127.0.0.1` unless `SIBYL_API_HOST` says otherwise, and warns at startup
  when bound elsewhere without a token.
- **Validation.** Every write is parsed against the zod schemas in `packages/shared`; invalid input is a
  400 with the validation issues, malformed JSON a 400, bodies over 50 MB a 413. Errors never include
  stack traces or paths.
- **Path safety.** Session ids are validated as UUIDs before becoming file names; the store asserts it
  again before building a path.
- **Atomic, fault-tolerant storage.** Temp file + rename; an unreadable file is skipped, not fatal.
- **Signed webhooks.** `SIBYL_WEBHOOK_URL` refuses to start without `SIBYL_WEBHOOK_SECRET`; each delivery
  carries an HMAC-SHA256 signature and times out after 10 s.
- **Retention.** `SIBYL_RETENTION_DAYS` deletes old sessions from memory and disk.

### AI agents (`packages/agent`)

- `SIBYL_DISABLE_AI` accepts `1`, `true`, `yes`, `on` in any case and raises a typed `AIDisabledError`
  (it used to honour only the exact string `true`).
- Spend is capped per organisation, checked against a worst-case estimate before each call, and the
  budget store **fails closed** when corrupt instead of resetting spend.
- The response cache is keyed by agent, model and organisation, so one organisation never receives
  another's cached answer.
- The investigator's tool loop is bounded (8 turns) and clamps model-supplied parameters.

### Enterprise libraries (`@sibyl/core/enterprise`)

These are **libraries, not features of the running API** — nothing routes requests to them yet.

- **SSO** (SAML Jackson) fails closed: without a working database it refuses `authorize` and `callback`.
  It previously returned an `admin@<tenant>` profile for any callback when the database was unreachable.
  The OAuth `state` is random, single-use, bound to the tenant and expires after 10 minutes.
- **SCIM** fails closed the same way; it previously reported users as provisioned without storing them.
- **Audit log** entries are frozen on write and copied on read; the default sink is in-memory and bounded.
- **RBAC** defines four roles and their permissions; no API route enforces it.

## What is not protected

- **Reads on the API are unauthenticated.** Anyone who can reach it can read every session. Put it behind
  an authenticating proxy on any shared network.
- **No multi-tenancy.** There are no organisations in the API; every session is visible to every reader.
- **No sandboxing on the main path.** Runs execute in the CLI's process. The Docker sandbox and worker are
  scaffolding (see [`ARCHITECTURE.md`](ARCHITECTURE.md) §6.3).
- **No local LLM endpoint.** Earlier documents mentioned `SIBYL_LOCAL_LLM_URL`; it was never implemented.
