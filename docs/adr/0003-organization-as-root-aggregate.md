# Organization as Root Aggregate for Multi-Tenancy

## Summary

LogLog uses Organization as the root aggregate for multi-tenancy. All metadata (users, connections, sources, settings) belongs to exactly one organization and is segregated at the database level in PostgreSQL. Telemetry data in ClickHouse, however, is NOT segregated by organization—each organization connects to its own ClickHouse instance(s) via Connections.

## Context

As an observability platform supporting multiple organizations, we needed to decide:

1. **Where is multi-tenancy enforced?** (database level, query filter, application level)
2. **What is the root aggregate?** (Organization, User, something else)
3. **Is telemetry data segregated?** (per-org databases or shared storage)

Early alternatives:
- **Per-org databases**: Each organization gets its own ClickHouse + PostgreSQL. Operationally complex, harder to manage.
- **Query-level filtering**: Single ClickHouse shared by all orgs, filtered by `organizationId` column. Risky (filter bypass = data leak).
- **Hybrid (chosen)**: Single application with shared PostgreSQL (metadata), each org connects to its own ClickHouse (telemetry). Organization enforces boundaries at API layer + database foreign keys.

## Decision

**Organization is the root aggregate** for the platform:

1. **Every user belongs to at least one organization** (created by default on signup)
2. **All metadata is segregated by organizationId**:
   - connections.organizationId FK
   - sources.organizationId FK
   - members.organizationId FK
   - settings include organizationId
3. **Every API call validates** that the user's active organization matches the resource being accessed
4. **Telemetry data (ClickHouse) is not segregated by organizationId** because:
   - ClickHouse is the customer's own instance (managed via Connection)
   - LogLog doesn't own the data—it's a visualization layer
   - Segregation happens at the storage layer (customer manages their ClickHouse)

## Example

Two organizations sharing the same LogLog SaaS instance:

```
PostgreSQL (shared, segregated by org):
├── organizations
│   ├── Acme Corp (id: org-1)
│   └── BigCorp (id: org-2)
│
├── members (organizationId FK enforced)
│   ├── alice (org-1)
│   ├── bob (org-1)
│   └── carol (org-2)
│
├── connections (organizationId FK enforced)
│   ├── Acme's ClickHouse Prod (org-1)
│   └── BigCorp's ClickHouse US (org-2)
│
└── sources (organizationId FK enforced)
    ├── Acme App Logs (org-1, connection: Acme CH)
    └── BigCorp Logs (org-2, connection: BigCorp CH)

ClickHouse A (Acme's instance):
├── logs (raw telemetry, NO organizationId column needed)
├── traces
└── metrics

ClickHouse B (BigCorp's instance):
├── logs (raw telemetry, NO organizationId column needed)
├── traces
└── metrics
```

When alice (org-1) views the "Acme App Logs" source:
1. Backend validates: session.user ∈ org-1, source.organizationId = org-1, connection.organizationId = org-1
2. Backend fetches connection credentials (for Acme's ClickHouse)
3. Backend proxies query to Acme's ClickHouse
4. Result returned only to alice (who is in org-1)

BigCorp's data is in a completely separate ClickHouse instance. Even if alice somehow bypassed query filters, she'd hit a different database owned by a different customer.

## Consequences

**Positive:**
- **Strong isolation**: Each organization's telemetry is in their own ClickHouse; data leaks are infrastructure-level, not application-level bugs
- **Scalability**: Each org can size their ClickHouse independently
- **Compliance**: Orgs can host ClickHouse in their own region/infrastructure if needed
- **Simplicity**: No need to filter every query by organizationId; storage is the boundary
- **Customer control**: Organizations own their data, LogLog is just the UI layer

**Negative:**
- **Operational complexity**: LogLog must manage many external ClickHouse connections
- **Connection management overhead**: Each organization needs to provide/manage their own ClickHouse (or we provide one, which complicates deployment)
- **RBAC complexity**: Future fine-grained access control must exist within the organization (who can see what source)

## Future RBAC

When RBAC is implemented, it will enforce at the application layer:
- Owner: full access to organization resources
- Admin: can manage connections, sources, members
- Member: read-only access to assigned sources (exact permissions TBD)

RBAC will NOT affect telemetry isolation—that's still enforced by ClickHouse ownership.

## Related Decisions

[[0002-connection-vs-source-abstraction]]
