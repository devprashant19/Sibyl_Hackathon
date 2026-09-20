# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Sibyl, **please do not open a public GitHub issue.** Instead, report it responsibly:

1. **Email:** Send a detailed report to `security@sibyl.dev` (or the maintainer's contact listed in the repository).
2. **Include:** A clear description of the vulnerability, steps to reproduce, and any relevant logs or screenshots.
3. **Response time:** We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 business days for critical issues.

## Supported Versions

| Version | Supported |
|---|---|
| Latest `main` | ✅ Active development |
| Tagged releases | ✅ Security patches backported |

## Security Architecture

Sibyl is designed for deployment in high-security enterprise environments. The following security controls are built into the platform:

### Authentication

- **Session-based authentication** with secure, HTTP-only cookies.
- **SAML 2.0 and OIDC SSO** via `@boxyhq/saml-jackson` (Pythia tier). We deliberately chose an established library over hand-rolled SAML to avoid the well-documented class of vulnerabilities in custom SAML implementations (XML signature wrapping, assertion replay, etc.).
- **SCIM 2.0** for automated user provisioning and deprovisioning from enterprise identity providers.

### Authorization (RBAC)

Four roles enforced at the API middleware layer:

| Role | Capabilities |
|---|---|
| **Owner** | Full control — billing, org deletion, role management |
| **Admin** | Manage projects, API keys, view audit logs, manage members |
| **Member** | Create/run simulations, manage own promises and schedules |
| **Viewer** | Read-only access to runs and results — cannot manage API keys or promises |

### Audit Logging

- **Immutable, append-only audit log** recording every security-relevant action:
  - API key created / revoked
  - Promise created / edited / deleted
  - Project created / deleted
  - User invited / removed / role changed
  - SSO configuration changed
  - Data retention policy changed
- Audit logs are viewable by org admins in the dashboard.
- The `AuditLogger` class (`packages/core/src/audit/logger.ts`) is the single source of truth.

### Data Isolation

- **Simulation sandboxing:** Every simulation run executes inside a Docker-in-Docker container with its own network namespace. Cross-run data leakage is structurally prevented.
- **Multi-tenant isolation:** All database queries are scoped by `orgId`. There is no code path that can access another organization's data.
- **Data retention:** Configurable per-org retention policies with automated purging. The retention worker (`packages/worker`) has a dry-run mode for testing before enforcement.

### Air-Gapped Deployment

For zero-egress environments:

- `SIBYL_ENTERPRISE_SELF_HOSTED=true` — Disables all outbound calls to Stripe and telemetry services.
- `SIBYL_DISABLE_AI=true` — Disables all outbound calls to Anthropic's API. AI features throw an explicit error rather than silently degrading.
- `SIBYL_LOCAL_LLM_URL` — Optional: route AI features through a customer-provided, internally-hosted LLM endpoint.

### Compliance

- **SOC 2 evidence generator** (`packages/core/src/audit/compliance.ts`) produces exportable reports covering:
  - RBAC configuration and enforcement
  - Audit log completeness and integrity
  - Data retention policy enforcement
  - Control mappings for SOC 2 Type II readiness

### Dependencies

- We use `pnpm audit` in CI to check for known vulnerabilities in dependencies.
- Critical dependencies (cryptographic primitives, auth libraries) are pinned to exact versions.
- The PRNG implementation (`packages/core/src/prng.ts`) uses Mulberry32 — this is a fast, deterministic generator for simulation purposes and is **not** used for any security-sensitive operations. All security-sensitive randomness uses Node.js `crypto.randomUUID()`.
