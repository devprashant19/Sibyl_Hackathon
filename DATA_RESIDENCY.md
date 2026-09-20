# Sibyl Data Residency Guarantees

For enterprise customers with strict data-residency and compliance requirements (e.g., GDPR, HIPAA), Sibyl offers two deployment models: **Multi-Region SaaS** and **Full Self-Hosted**.

This document outlines exactly what data residency guarantees are provided by the Multi-Region architecture.

## The Multi-Region Architecture
In the Multi-Region SaaS model, Sibyl maintains a centralized **Control Plane** (API, Database, Queue) in a Primary Region (e.g., `us-east-1`), but provisions lightweight **Worker Pools** in your preferred local region (e.g., `eu-central-1`).

### What is Guaranteed (Execution Locality)
By selecting a region-specific worker pool, you guarantee the following:
1. **Network Locality**: All simulated faults, HTTP requests, database queries, and gRPC calls injected by Sibyl originate *strictly* from the Worker Pool inside that region. Egress traffic never crosses oceanic boundaries to hit your internal APIs.
2. **Compute Isolation**: The Javascript/Python/Go simulation scripts you write are evaluated locally on the worker nodes inside that region's sandboxes.

### What Still Leaves the Region
Because the Control Plane remains centralized, the following metadata **will leave your region** and be transmitted back to the primary database:
1. **Run Metadata**: Pass/Fail status, simulation seed, duration, and error stack traces.
2. **Captured Events (Telemetry)**: Any `CapturedEvent` generated during the run (e.g., HTTP request URLs, HTTP response payloads, Database query strings) is shipped back to the primary control plane for dashboard rendering.

> [!WARNING]
> If your application's HTTP response payloads contain PII or sensitive data, and you do not sanitize them in your simulation script, **that PII will cross region boundaries** when the telemetry is saved to Sibyl's database.

## When to Choose Full Self-Hosting
If your organization requires absolute **Zero Egress** of telemetry or PII metadata across region boundaries, the Multi-Region SaaS model is insufficient. 

You must deploy the **Full Self-Hosted** version of Sibyl, which deploys the Control Plane, Postgres database, and Worker Pools entirely within your own AWS/GCP account or on-premise Kubernetes cluster.
