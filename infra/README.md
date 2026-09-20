# Infrastructure

Deployment configuration for the parts of Sibyl that run as services.

## Docker Compose (repository root)

Images are built from the monorepo with `docker/Dockerfile` (targets `api`, `dashboard`, `worker`).

```bash
docker compose up -d --build                    # API on :4000, dashboard on :3000
docker compose --profile worker up -d --build   # + Redis and the queue worker (mounts /var/run/docker.sock)
docker compose --profile enterprise up -d       # + Postgres, only for the SSO/SCIM modules (POSTGRES_URI)
docker compose -f docker-compose.observability.yml up -d   # Jaeger :16686, Prometheus :9090, Grafana :3001
```

- The API stores sessions in the `sibyl_sessions` volume. Set `SIBYL_API_TOKEN` before exposing port 4000.
- The dashboard's `NEXT_PUBLIC_SIBYL_API_URL` (default `http://localhost:4000`) is baked in at build time and
  must be reachable from the browser; change it with `NEXT_PUBLIC_SIBYL_API_URL=... docker compose build dashboard`.
- The observability stack receives OTLP on 4317/4318, but Sibyl does not export traces or metrics
  unless the host process registers an OpenTelemetry SDK; Prometheus scrapes only itself and Jaeger
  (`infra/observability/prometheus.yml`).

## Terraform (`terraform/`)

Kubernetes worker pools that consume the BullMQ queue `simulation-run-queue`, autoscaled by KEDA.

| Module | Creates |
|---|---|
| `modules/control-plane` | the `sibyl-system` namespace |
| `modules/worker-pool` | namespace (optional), Secret with the Redis URL, worker Deployment, KEDA ScaledObject |

It does **not** create Redis, the API, the dashboard, databases, networks or clusters. Prerequisites:
kubeconfigs at `~/.kube/config-primary` and `~/.kube/config-eu-central`, KEDA installed in each
cluster (the ScaledObject CRD must exist at plan time), a reachable Redis, and a pushed worker image.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set primary_redis_url / eu_central_redis_url
terraform init
terraform plan
```

The worker starts simulation sandboxes with the `docker` CLI, which a plain Kubernetes pod does not
have; running jobs there needs a Docker-capable node setup (e.g. a DinD sidecar) that these modules
do not provide.

## Pulumi (`index.ts`)

A placeholder program that provisions no resources.
