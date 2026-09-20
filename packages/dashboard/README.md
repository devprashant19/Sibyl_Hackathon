# Sibyl Dashboard

The Next.js web application for the Sibyl chaos engineering platform.

## Overview

This package serves two purposes:

1. **Public marketing site** (`/`) — The landing page implementing the Appendix A reference design with the Sibyl "Ink and Gold" aesthetic. Features tab-style navigation, a live-typing oracle console, fault domain grid, before/after incident timeline, pricing tiers, and a gated interactive demo.

2. **Authenticated dashboard** (`/runs`, `/projects`, `/settings`) — The operational interface where engineers view simulation runs, manage projects, configure promises, browse audit logs, and trigger AI agent analysis.

## Routes

| Route | Auth | Description |
|---|---|---|
| `/` | Public | Marketing landing page |
| `/runs` | Required | Simulation run list with filtering and search |
| `/runs/:id` | Required | Run detail view: event timeline, promise results, AI analysis |
| `/projects` | Required | Project management |
| `/settings` | Required | Org settings, RBAC, API keys, SSO configuration, billing |
| `/audit` | Admin+ | Immutable audit log viewer |

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Components:** `@sibyl/ui` shared component library
- **State:** React Server Components + client hooks
- **Auth:** Session-based with SSO support

## Reference Implementation

The canonical design mockup is preserved at `reference/sibyl-site.html`. This is the Appendix A reference from the design document — a standalone HTML file with all CSS and JavaScript inline. Use it as the ground-truth for any design decisions.

## Development

```bash
pnpm dev      # Start Next.js dev server on port 3000
pnpm build    # Production build
pnpm lint     # ESLint
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Sibyl API server URL |
| `NEXTAUTH_SECRET` | — | NextAuth session secret |
| `NEXTAUTH_URL` | `http://localhost:3000` | Canonical app URL |
