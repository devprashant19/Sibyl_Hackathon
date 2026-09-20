# Sibyl Enterprise Self-Hosting (Pythia Tier)

Sibyl provides a robust self-hosting option designed for high-security, air-gapped VPC deployments.

## Quick Start
You can deploy the entire stack using the provided `docker-compose.yml`.

```bash
docker-compose up -d
```

### Components Deployed
1. **PostgreSQL 15**: Persistent data store.
2. **Redis 7**: Used for BullMQ queues and rate-limiting.
3. **Sibyl Core API (`api`)**: The chaos engine backend on port 4000.
4. **Sibyl Dashboard (`dashboard`)**: The web UI on port 3000.

## Environment Variables & Air-Gapped Mode

### `SIBYL_ENTERPRISE_SELF_HOSTED=true`
**What this disables:**
- **Stripe Billing**: Bypasses all `402 Payment Required` errors and Stripe subscription API calls. 
- **Telemetry**: Disables any platform analytics "phoning home".

### `SIBYL_DISABLE_AI=true`
**What this disables:**
- **Anthropic API Calls**: All AI features (Root-Cause Explainer, Investigator, Patcher, Postmortem Analyzer) are strictly disabled.
- **Why**: In a zero-egress VPC, the agents cannot reach the Claude API. If you attempt to use an AI feature, it will not fail silently; it will throw an explicit error explaining that AI is disabled due to the air-gap configuration.
- **Alternative**: If you want AI in an air-gapped VPC, you can set `SIBYL_DISABLE_AI=false` and provide `SIBYL_LOCAL_LLM_URL` pointing to your own internally hosted model (e.g. Llama 3 via vLLM).

## Routing & TLS
We recommend keeping the Docker Compose stack behind your own internal Application Load Balancer or Reverse Proxy (e.g., Traefik/Nginx) to handle SSL termination and VPC routing.
