# @sibyl/api

The REST API server for the Sibyl platform.

## Overview

An Express.js server that exposes the Sibyl platform's functionality over HTTP. Handles authentication, authorization, run management, project CRUD, SSE progress streaming, billing webhooks, and audit log queries.

## Endpoints

### Simulation Runs

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/search-sessions` | Create a new search session (batch of simulation runs) |
| `GET` | `/api/v1/runs` | List simulation runs (paginated, filterable by project/status) |
| `GET` | `/api/v1/runs/:id` | Get a single run with captured events and promise results |
| `POST` | `/api/v1/runs/:id/replay` | Replay a run with its original seed and schedule |
| `GET` | `/api/v1/runs/:id/events` | SSE stream of real-time run progress |

### Projects

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/projects` | Create a project |
| `GET` | `/api/v1/projects` | List projects for the current org |
| `GET` | `/api/v1/projects/:id` | Get project details |
| `DELETE` | `/api/v1/projects/:id` | Delete a project (audit-logged) |

### Promises

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/promises` | Create or update a promise definition |
| `GET` | `/api/v1/promises` | List promises for a project |

### Auth & Organization

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Session-based login |
| `POST` | `/api/v1/auth/sso` | SAML/OIDC SSO initiation |
| `GET` | `/api/v1/org/members` | List org members with roles |
| `PATCH` | `/api/v1/org/members/:id/role` | Update a member's RBAC role |
| `GET` | `/api/v1/org/audit-log` | Query the immutable audit log |

### Billing

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/billing/webhook` | Stripe webhook receiver |
| `GET` | `/api/v1/billing/usage` | Current billing period usage |

### AI Agents

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/agent/investigate` | Trigger the Investigator agent |
| `POST` | `/api/v1/agent/explain/:runId` | Trigger the Explainer agent for a specific run |
| `POST` | `/api/v1/agent/patch/:runId` | Trigger the Patcher agent |
| `POST` | `/api/v1/agent/postmortem/:runId` | Generate a postmortem report |

## Middleware Stack

1. **CORS** — Configured for dashboard origin.
2. **Rate limiting** — Per-org, plan-aware rate limits.
3. **Authentication** — Session validation or API key verification.
4. **RBAC** — Role-based access control. Each route declares its minimum required role.
5. **Billing enforcement** — Checks plan limits before allowing run creation.
6. **Audit logging** — Security-relevant actions are logged to the immutable audit table.
7. **OpenTelemetry** — Request tracing and metric recording.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `SESSION_SECRET` | — | Secret for session cookie signing |
| `ANTHROPIC_API_KEY` | — | Required for AI agent endpoints |

## Development

```bash
pnpm dev    # Start with hot-reload (nodemon/tsx)
pnpm build  # Compile TypeScript
pnpm test   # Run tests
```
