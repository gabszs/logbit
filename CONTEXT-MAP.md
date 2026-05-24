# Context Map

LogLog is an OpenTelemetry observability platform. It provides visualization and management of telemetry data stored in ClickHouse, along with organization and access control.

## Shared Language

**Organization**: A container for data segregation and access control. Every user belongs to at least one organization (created by default on first login). All metadata (connections, sources, members) belongs to exactly one organization. Telemetry data in ClickHouse is not segregated by organization—instead, each organization can connect to its own ClickHouse instances or integrations.

**Member**: A user who belongs to an organization with a specific role. Roles are: owner, admin, member (currently no RBAC enforcement, planned for future).

**Connection**: An external integration endpoint (ClickHouse, Resend, Cloudflare, etc.). Represents a "WHERE" to read or send data. Belongs to exactly one organization. Contains connection credentials and configuration.

**Source**: A definition of HOW to read a specific signal type (logs, traces, metrics, sessions) from a Connection. Belongs to exactly one organization and references exactly one Connection. Contains:
- Default query configuration
- Auto-ordering rules
- Correlation references to other sources

**Correlation**: A relationship between sources based on shared IDs (traceId, spanId, etc.). Allows navigation between related signals when viewing data.

**User**: A person who can authenticate and belong to multiple organizations. Has a profile (name, email, image) and per-organization settings (theme, active organization, default source/connection preferences).

## Contexts

### [Organization & Access](./docs/contexts/organization-access/CONTEXT.md)

Manages who users are, which organizations they belong to, and their preferences. Responsible for user identity, organization membership, and UX settings.

**Features**: profile, settings, auth (transversal)

**Data**: users, organizations, members, sessions, settings

### [Data Integration](./docs/contexts/data-integration/CONTEXT.md)

Manages how telemetry data is collected and exposed. Responsible for external integrations, agent management, and secure query proxying.

**Features**: connections, sources, opamp, proxy

**Data**: connections, sources (and their correlations)

## Relationships

- **Organization → Access**: Organization is the root aggregate. Every member, connection, and source belongs to exactly one organization.

- **Access ↔ Integration**: 
  - When a user authenticates, they select an active organization (stored in settings)
  - Users can view connections and sources only within their active organization
  - Settings remember which source/connection the user last viewed (UX preference, not permission)

- **Integration → ClickHouse**:
  - Connections store credentials to external systems
  - Sources define HOW to read data from a connection
  - Frontend loads a Source and creates a typed ClickHouse client
  - Frontend queries the backend proxy endpoint `/v1/clickhouse-proxy/connections/:connectionId`
  - Backend validates auth, fetches Connection credentials, proxies the query to ClickHouse
  - Result returns to frontend (still strongly typed via Zod/generated types)

## Example Scenario

**Acme Corp (Organization)** has:
- **Members**: alice (owner), bob (admin), carol (member)
- **Connections**: 
  - "ClickHouse Prod" → credentials for ch.acme.internal
  - "Resend" → API key for email integration
- **Sources**:
  - "App Logs" (type: logs) → reads from logs table in ClickHouse Prod, configured with default WHERE and ORDER BY
  - "API Traces" (type: traces) → reads from traces table in ClickHouse Prod
  - Correlations: App Logs can search traces by traceId

**Carol's workflow:**
1. Logs in → system creates default organization for her
2. Admin invites her to Acme Corp with role=member
3. Carol selects Acme Corp as active organization (stored in settings)
4. Carol views Sources → sees "App Logs" and "API Traces"
5. Carol clicks "App Logs" → frontend loads Source definition
6. Carol constructs a query (via UI) → frontend sends to `/v1/clickhouse-proxy/connections/{ch.prod.id}`
7. Backend validates: session.user ∈ Acme Corp, connection ∈ Acme Corp
8. Backend fetches Connection credentials, proxies query to ClickHouse
9. Result returned to frontend, displayed in UI
10. Carol sees a log entry with traceId=abc-123
11. Carol clicks correlation → frontend searches Source "API Traces" by traceId=abc-123
12. Trace appears, correlated with the log
