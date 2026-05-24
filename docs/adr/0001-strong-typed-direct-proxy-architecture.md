# Strong-Typed Direct Proxy Architecture for ClickHouse Queries

## Summary

LogLog exposes ClickHouse queries to the frontend via a direct proxy pattern, rather than traditional REST endpoints with abstracted data models. The frontend loads Source definitions, constructs queries directly against ClickHouse schema, and sends them through an authenticated proxy endpoint. All communication is strongly typed end-to-end using generated types from the backend (Zod schemas, oRPC, Hono RPC).

## Context

Traditional observability platforms abstract telemetry querying behind REST APIs: the frontend calls `/api/logs?filter=X&limit=Y` and the backend returns pre-processed results. This requires the backend to define every query shape the UI might need, creating tight coupling.

LogLog takes a different approach: the frontend has direct knowledge of the ClickHouse schema (via Source definitions) and constructs its own queries. The backend only handles authentication and credential injection.

## Decision

We chose this architecture because:

1. **Schema flexibility**: ClickHouse schema is the source of truth. The UI automatically adapts when ClickHouse tables change, without requiring backend API changes.

2. **User power**: Users can write arbitrary queries (within Source context) rather than being limited to predefined dashboard filters.

3. **Type safety end-to-end**: By exporting types from the backend (Zod, oRPC clients), the frontend knows the shape of data without runtime surprises.

4. **Separation of concerns**: 
   - Backend manages: auth, organization isolation, connection credentials, agent management
   - Frontend manages: query construction, visualization, user interaction
   - No duplicate filtering logic in two places

## How It Works

1. **Frontend loads a Source** (e.g., "App Logs" source) via `/api/sources/:id`
   - Gets: table name, default query config, correlation references, connection ID

2. **Frontend creates a ClickHouse client** (using `@clickhouse/client-web` or similar)
   - Knows the schema from the Source definition

3. **User constructs a query** in the UI (via filters, time range, etc.)

4. **Frontend sends query to proxy endpoint**:
   ```
   POST /v1/clickhouse-proxy/connections/:connectionId
   {
     "query": "SELECT * FROM app_logs WHERE timestamp > ? AND level = 'ERROR' ORDER BY timestamp DESC LIMIT 100"
   }
   ```

5. **Backend proxy validates and forwards**:
   - Checks: user is authenticated, organization owns this connection
   - Fetches Connection credentials from database
   - Injects credentials and proxies query to ClickHouse
   - Returns typed result to frontend

6. **Frontend receives data** and renders it (still typed via Zod)

## Consequences

**Positive:**
- UI has access to full ClickHouse power (any query shape is possible)
- Backend stays thin and focused (auth + credential management only)
- Schema changes don't require backend API versioning
- Strongly typed end-to-end reduces bugs
- Scales well: complex queries happen on ClickHouse, not in-app filtering

**Negative:**
- Frontend needs some SQL knowledge (though UI can hide this with builders)
- Credentials must be carefully managed in the proxy (risk if not done well)
- Requires careful validation to prevent SQL injection via user-constructed queries
- More responsibility on frontend devs to write performant queries

## Related Decisions

[[0002-connection-vs-source-abstraction]]
[[0003-organization-as-root-aggregate]]
