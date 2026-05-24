# Two-Layer Abstraction: Connection vs Source

## Summary

Data integration in LogLog is modeled as two separate entities:

- **Connection**: WHERE to read data (credentials and endpoint for ClickHouse, Resend, Cloudflare, etc.)
- **Source**: HOW to read specific data (which table, default query, signal type, correlations)

Each Source belongs to exactly one Connection, but one Connection can support multiple Sources.

## Context

Early in the project, we considered a single "Integration" entity that would combine both concerns. However, this led to confusion about responsibility and flexibility.

For example, if a single entity represented "ClickHouse integration," where would we define:
- The ClickHouse host/credentials? (WHERE—infrastructure concern)
- Which table to query for logs vs. traces? (HOW—data shape concern)
- What the default query looks like? (HOW—UX/performance concern)

Mixing these leads to unclear boundaries and makes it hard to reuse the same ClickHouse instance for multiple query patterns.

## Decision

We created two separate entities:

**Connection** (infrastructure layer):
- Represents access to an external system
- Stores credentials and configuration (host, port, API key, etc.)
- Belongs to exactly one Organization
- Can be reused by multiple Sources
- Types: ClickHouse, Resend, Cloudflare, etc.

**Source** (data model layer):
- Represents a specific signal and how to read it
- Specifies table name, default query config, signal type (logs/traces/metrics/sessions)
- Contains correlation configuration (relationships to other sources)
- Belongs to exactly one Organization
- References exactly one Connection
- Type-specific (a source is either logs OR traces, not both)

## Example

Org "Acme Corp" with one ClickHouse instance:

```
Connection "ClickHouse Prod" (ch.acme.internal:8123, creds)
├── Source "App Logs" (table: app_logs, signal: logs)
├── Source "API Traces" (table: traces, signal: traces)
└── Source "Worker Metrics" (table: metrics, signal: metrics)

Multiple sources can read from the same connection
```

Org "BigCorp" with multiple ClickHouse instances (multi-region):

```
Connection "ClickHouse US" (ch-us.corp.internal)
├── Source "US App Logs" (table: app_logs, region: us)

Connection "ClickHouse EU" (ch-eu.corp.internal)
├── Source "EU App Logs" (table: app_logs, region: eu)
```

Same organization, different connections for different geographies.

## Consequences

**Positive:**
- Clear separation of concerns (infrastructure vs. data modeling)
- Reusability: one Connection can power multiple Sources
- Flexibility: new signal types or table configurations don't require new Connections
- Scalability: Organizations can grow connections and sources independently
- Schema clarity: it's obvious what belongs where

**Negative:**
- More entities to manage (users need to understand both concepts)
- Requires clear UI/UX to guide users through creating both (can't create Source without Connection first)
- Adds database complexity (joins between tables)

## Related Decisions

[[0001-strong-typed-direct-proxy-architecture]]
[[0003-organization-as-root-aggregate]]
