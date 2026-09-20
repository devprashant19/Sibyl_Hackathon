# Self-Hosting

What there is to host: the **API** (stores sessions, serves the dashboard) and the **dashboard**. Searches
always run where the CLI runs — on developer machines or CI runners, next to the code under test — and
upload to the API. There is no hosted control plane and no database to run.

> **Status.** The compose file and Dockerfile validate (`docker compose config`) and the dashboard build they
> run succeeds, but the images have not been built and run end to end in this repository's CI yet. If
> something fails, the non-Docker path below is the tested one.

## Docker Compose

```bash
docker compose up -d --build        # API on :4000, dashboard on :3000
```

Then point CLIs at it:

```bash
SIBYL_API_URL=http://<host>:4000 SIBYL_API_TOKEN=<token> pnpm sibyl ci -c path/to/sibyl.config.ts
```

| Variable (set in your shell or a `.env` next to `docker-compose.yml`) | |
|---|---|
| `SIBYL_API_TOKEN` | **Set this on any shared host.** Without it, anyone who can reach :4000 can upload. |
| `NEXT_PUBLIC_SIBYL_API_URL` | Where *browsers* reach the API (default `http://localhost:4000`). Baked in at build time: change it, then `docker compose build dashboard`. |
| `SIBYL_RETENTION_DAYS` | Delete sessions older than N days |
| `SIBYL_CORS_ORIGIN` | Restrict which origin may call the API from a browser |

Sessions persist in the `sibyl_sessions` volume as one JSON file per session.

Optional profiles:

```bash
docker compose --profile worker up -d --build       # + Redis and the queue worker (scaffold; see ARCHITECTURE.md §6.3)
docker compose --profile enterprise up -d --build   # + Postgres, needed only by the SSO/SCIM libraries
docker compose -f docker-compose.observability.yml up -d   # Jaeger :16686, Prometheus :9090, Grafana :3001
```

The observability stack is infrastructure only: the API does not export metrics or traces today.

## Without Docker

```bash
pnpm install
SIBYL_API_HOST=0.0.0.0 SIBYL_API_TOKEN=<token> SIBYL_DATA_DIR=/var/lib/sibyl pnpm api
NEXT_PUBLIC_SIBYL_API_URL=http://<host>:4000 pnpm --filter @sibyl/dashboard build
pnpm --filter @sibyl/dashboard start
```

## Routing and TLS

Terminate TLS in a reverse proxy in front of both services. Reads on the API are unauthenticated, so on
anything other than a trusted network put the API (at least `GET /api/v1/*`) behind the proxy's
authentication as well. See [`SECURITY.md`](SECURITY.md).

## Air-gapped use

At runtime the CLI talks only to `SIBYL_API_URL` (when set) and the API makes no outbound requests except
optional webhooks. Two things do reach the internet:

- **Building the dashboard** downloads its fonts from Google (`next/font/google` in
  `packages/dashboard/src/app/layout.tsx`). Build the image where that is allowed, or switch to
  `next/font/local`.
- **The AI commands** (`sibyl explain`, `investigate`, `retro`) call Anthropic. Set `SIBYL_DISABLE_AI=1` on
  runners to make them refuse explicitly. There is no local-LLM option.
