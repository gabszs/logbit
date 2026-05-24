# Data Integration Context

Manages how telemetry data flows into LogLog and how it's queried. Responsible for external integrations, agent management, and secure query proxying. This context bridges the gap between external systems (ClickHouse, OTEL collectors, Resend, Cloudflare) and the frontend UI.

## Language

**Connection**: An external system integration endpoint. Represents a "WHERE" (location and credentials) to read or send data. Belongs to exactly one organization. Types include ClickHouse, Resend, Cloudflare, and more in the future.
_Avoid_: Integration (too generic—Integrations include more than Connections), Adapter (implementation detail), Client

**ClickHouse Connection**: A specific type of Connection that points to a ClickHouse instance. Contains host, port, username, password, and other ClickHouse-specific credentials. Used by Sources to read telemetry data and by the Proxy to authenticate queries.
_Avoid_: ClickHouse Account, Database Connection

**Source**: A definition of HOW to read a signal from a Connection. Represents a specific type of telemetry (logs, traces, metrics, sessions) and includes:
- Reference to exactly one Connection
- Type (logs, traces, metrics, sessions) — one type per source
- ClickHouse table name(s) to query
- Default query configuration (default SELECT, WHERE, ORDER BY)
- Correlation configuration (references to other sources for related data)

Belongs to exactly one organization. Provides the bridge between telemetry data in ClickHouse and the UI.
_Avoid_: Integration (that's the Connection), Datasource (ambiguous—could mean the data or the config), Feed

**Signal Type**: The classification of a telemetry event. Types: logs, traces, metrics, sessions. Each Source has exactly one signal type.
_Avoid_: Event Type (event is the raw data in ClickHouse), Category, Kind

**Log**: A discrete event from a log source. Contains timestamp, level, message, and arbitrary fields (structured or unstructured). Stored in ClickHouse table `otel_logs`.
_Avoid_: LogEntry (same thing), Event (too generic), Message

**Trace**: A distributed trace representing a request or transaction. Contains a unique traceId and multiple spans. Stored in ClickHouse table `otel_traces`.
_Avoid_: Request Trace (too long), Transaction (different concept), Span (a span is part of a trace)

**Metric**: A numerical measurement at a point in time. Types: gauge, sum, histogram, exponential histogram, summary. Stored in ClickHouse (type-specific tables: `otel_metrics_gauge`, `otel_metrics_sum`, etc.).
_Avoid_: Measurement (too generic), Data Point (ambiguous)

**Session**: A user session replay or aggregated session data. Contains session metadata and events within that session. Stored in ClickHouse table `otel_sessions`.
_Avoid_: User Session (redundant—sessions are always for users), Window

**Correlation**: A configured relationship between sources that share a common identifier (traceId, spanId, userId, etc.). Allows navigation between related signals. For example, a Log Source with correlation to a Trace Source means: "when viewing a log with traceId=X, also fetch traces with traceId=X."
_Avoid_: Relationship (too generic), Link (implementation detail), Association

**Default Query Configuration**: The standard SQL query pattern for a Source, including default WHERE clauses, ORDER BY, and limits. Set by the Source creator, customizable by users at query time.
_Avoid_: Query Template (template implies immutability), Preset, Filter

**Agent**: An OpenTelemetry collector instance running in the user's environment. Sends telemetry data to ClickHouse via the OTEL exporter. Managed remotely via OpAMP protocol.
_Avoid_: Collector (OTEL Collector is the software, Agent is the instance), Process, Service

**OpAMP**: Open Agent Management Protocol. The protocol for bidirectional communication between the LogLog backend and remote agents. Used to push configuration updates and receive status reports from agents.
_Avoid_: Protocol (too generic), Heartbeat (one aspect of OpAMP, not the whole), Management Protocol (verbose)

**Proxy**: The backend HTTP service that authenticates and forwards ClickHouse queries. Receives queries from the frontend, resolves Connection credentials from the organization, adds authentication, and proxies the query to ClickHouse. Returns the result to the frontend.
_Avoid_: Gateway (too generic), Reverse Proxy (implementation detail), Adapter (implementation detail)

## Example Dialogue

**Scenario**: An organization sets up sources for the first time

> **Dev**: "We have a ClickHouse instance with logs, traces, and metrics. How do we expose these in LogLog?"
>
> **Domain Expert**: "First, create a Connection to your ClickHouse instance. That's your 'WHERE'—it stores the host, credentials, etc."
>
> **Dev**: "Then what?"
>
> **DE**: "Then create Sources. You'd create one Source for logs, one for traces, one for metrics. Each Source points to the same Connection but specifies which table to read and what the default query looks like."
>
> **Dev**: "Can multiple sources point to the same ClickHouse instance?"
>
> **DE**: "Yes. For example, you might have two log sources: one for application logs and one for infrastructure logs. Same Connection, different tables."
>
> **Dev**: "What about correlations? Can logs relate to traces?"
>
> **DE**: "Exactly. When you create the log source, you can configure it to say: 'correlate with the trace source via traceId.' Then when someone views a log with traceId=abc-123, the UI can fetch related traces."
>
> **Dev**: "And the frontend actually talks to ClickHouse directly?"
>
> **DE**: "The frontend constructs queries and sends them to our proxy endpoint. The proxy validates the user's org membership, fetches the Connection credentials, and proxies the query to ClickHouse. The frontend gets the typed result back."

## Flagged Ambiguities

**Source vs. Connection**:
- **Connection** = WHERE (location + credentials). Specific to an Organization.
- **Source** = WHAT + HOW (signal type + table + query config + correlations). Also specific to an Organization, references a Connection.
- A Connection can exist without Sources (configured but unused).
- A Source cannot exist without a Connection (every source reads from somewhere).

**Agent vs. Collector**:
- **Collector** = the OTEL Collector software (the open-source tool)
- **Agent** = an instance of the Collector running in the user's environment
- OTEL Collector instances are managed via OpAMP.

**Proxy vs. Gateway vs. Adapter**:
- We use **Proxy** specifically—it's transparent forwarding with authentication, not transformation or orchestration.
- It's not a full gateway (which would do more logic).
- It's not an adapter (which would translate between different protocols/formats).

**Signal Type vs. Event Type**:
- **Signal Type** = the category of telemetry (logs, traces, metrics, sessions)
- **Event Type** = field within a log (e.g., "error", "warning", "info")
- Use carefully in conversation: "What signal type is this source?" vs. "What event types does this log contain?"

## Reference: ClickHouse Schemas

For implementation details of telemetry storage, see [[SCHEMAS.md]] — ClickHouse table definitions for each signal type, including codecs, indexing strategies, and materialized views.
