# API Deprecation Policy

Sibyl guarantees a stable, predictable REST API for all your integrations, SDKs, and third-party tools. We use explicit path-based versioning (e.g., `/api/v1/...`) to ensure backward compatibility.

## 1. Versioning Strategy
- **Path-Based**: The API version is always explicit in the URL path: `https://api.sibyl.local/v1/runs`.
- **Additive Changes**: We will add new fields to existing endpoints without incrementing the major version. Your integrations should always ignore unknown JSON keys.
- **Breaking Changes**: Any breaking change (removing a field, changing a data type, altering authentication requirements) requires a new major version (`/v2/`).

## 2. Deprecation Timeline
When a new major version of the Sibyl API is released (e.g., `v2`), the previous version (`v1`) enters **Deprecation Mode**:
- **12-Month Support Window**: The deprecated version will remain fully functional and supported for exactly 12 months from the release of the new version.
- **Sunset Headers**: All responses from the deprecated version will immediately begin including the HTTP `Sunset` header indicating the exact date the endpoint will be turned off.
  ```http
  Sunset: Wed, 11 Nov 2027 23:59:59 GMT
  Deprecation: true
  ```
- **Active Communication**: Registered workspace admins will receive automated emails at 6 months, 3 months, and 1 month prior to sunsetting.

## 3. End-of-Life (EOL)
Once the Sunset date is reached, the deprecated endpoints will begin returning a `410 Gone` status code indefinitely.

## 4. GraphQL Stability
Our GraphQL endpoint (`/graphql`) is designed for fluid, dashboard-driven queries. We employ a continuous evolution strategy for GraphQL:
- We do not version the GraphQL endpoint.
- We aggressively use the `@deprecated(reason: "...")` directive.
- Fields marked deprecated will remain queryable for 6 months before being permanently removed from the schema.
