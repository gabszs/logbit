# SignOz — ClickHouse Schema, Pipeline de Ingestão e Acesso do Frontend

Análise do repositório em `/home/gabriel-carvalho/Documents/loglog/otel/signoz`.

---

## 1. Schema do ClickHouse

### Databases

SignOz usa **4 databases**:

| Database | Propósito |
|---|---|
| `signoz_traces` | Spans de traces |
| `signoz_metrics` | Samples de métricas |
| `signoz_logs` | Log records |
| `signoz_audit` | Audit logs |

Cada database tem tabelas locais (`MergeTree`) + tabelas distribuídas (`Distributed`) com prefixo `distributed_`.

Constantes definidas em:
- [`pkg/telemetrytraces/tables.go`](../../otel/signoz/pkg/telemetrytraces/tables.go)
- [`pkg/telemetrylogs/tables.go`](../../otel/signoz/pkg/telemetrylogs/tables.go)
- [`pkg/telemetrymetrics/tables.go`](../../otel/signoz/pkg/telemetrymetrics/tables.go)

---

### 1.1 Traces — `signoz_traces`

**Tabelas:**

```go
// pkg/telemetrytraces/tables.go
SpanIndexV3TableName          = "distributed_signoz_index_v3"
SpanIndexV3LocalTableName     = "signoz_index_v3"
TagAttributesV2TableName      = "distributed_tag_attributes_v2"
TopLevelOperationsTableName   = "distributed_top_level_operations"
TraceSummaryTableName         = "distributed_trace_summary"
SpanAttributesKeysTblName     = "distributed_span_attributes_keys"
TracesResourceV3TableName     = "distributed_traces_v3_resource"
```

**DDL principal — `signoz_index_v3`:**

```sql
-- exporter/clickhouseexporter/internal/sqltemplates/traces_table.sql
CREATE TABLE IF NOT EXISTS %q.%q %s (
    Timestamp    DateTime64(9) CODEC(Delta, ZSTD(1)),
    TraceId      String CODEC(ZSTD(1)),
    SpanId       String CODEC(ZSTD(1)),
    ParentSpanId String CODEC(ZSTD(1)),
    TraceState   String CODEC(ZSTD(1)),
    SpanName     LowCardinality(String) CODEC(ZSTD(1)),
    SpanKind     LowCardinality(String) CODEC(ZSTD(1)),
    ServiceName  LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeName    String CODEC(ZSTD(1)),
    ScopeVersion String CODEC(ZSTD(1)),
    SpanAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    Duration     UInt64 CODEC(ZSTD(1)),
    StatusCode   LowCardinality(String) CODEC(ZSTD(1)),
    StatusMessage String CODEC(ZSTD(1)),
    Events Nested (
        Timestamp  DateTime64(9),
        Name       LowCardinality(String),
        Attributes Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),
    Links Nested (
        TraceId    String,
        SpanId     String,
        TraceState String,
        Attributes Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),

    -- Skip indexes (data skipping, não primary key index)
    INDEX idx_trace_id     TraceId                    TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key  mapKeys(ResourceAttributes) TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_key  mapKeys(SpanAttributes)   TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_duration     Duration                    TYPE minmax              GRANULARITY 1

) ENGINE = %s   -- ReplicatedMergeTree em cluster, MergeTree em single-node
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SpanName, toDateTime(Timestamp))
%s              -- cláusula TTL se configurado
SETTINGS index_granularity=8192, ttl_only_drop_parts = 1
```

**Tabela auxiliar de lookup por TraceId:**

```sql
-- traces_id_ts_lookup_table.sql
CREATE TABLE IF NOT EXISTS "%s"."%s_trace_id_ts" %s (
    TraceId String CODEC(ZSTD(1)),
    Start   DateTime CODEC(Delta, ZSTD(1)),
    End     DateTime CODEC(Delta, ZSTD(1)),
    INDEX idx_trace_id TraceId TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = %s
PARTITION BY toDate(Start)
ORDER BY (TraceId, Start)
SETTINGS index_granularity=8192, ttl_only_drop_parts = 1
```

**Materialized View que alimenta a tabela de lookup:**

```sql
-- traces_id_ts_lookup_mv.sql
CREATE MATERIALIZED VIEW IF NOT EXISTS "%s"."%s_trace_id_ts_mv" %s
TO "%s"."%s_trace_id_ts"
AS SELECT
    TraceId,
    min(Timestamp) AS Start,
    max(Timestamp) AS End
FROM "%s"."%s"
WHERE TraceId != ''
GROUP BY TraceId
```

Essa MV permite encontrar o time range de um trace específico antes de varrer `signoz_index_v3`.

---

### 1.2 Logs — `signoz_logs`

**Tabelas:**

```go
// pkg/telemetrylogs/tables.go
LogsV2TableName               = "distributed_logs_v2"
LogsV2LocalTableName          = "logs_v2"
TagAttributesV2TableName      = "distributed_tag_attributes_v2"
LogAttributeKeysTblName       = "distributed_logs_attribute_keys"
LogResourceKeysTblName        = "distributed_logs_resource_keys"
LogsResourceV2TableName       = "distributed_logs_v2_resource"
PathTypesTableName            = "distributed_json_path_types"
PromotedPathsTableName        = "distributed_json_promoted_paths"
SkipIndexTableName            = "system.data_skipping_indices"
```

**DDL principal — `logs_v2`:**

```sql
-- exporter/clickhouseexporter/internal/sqltemplates/logs_table.sql
CREATE TABLE IF NOT EXISTS %q.%q %s (
    Timestamp        DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    TimestampTime    DateTime DEFAULT toDateTime(Timestamp),  -- coluna materializada para partition
    TraceId          String CODEC(ZSTD(1)),
    SpanId           String CODEC(ZSTD(1)),
    TraceFlags       UInt8,
    SeverityText     LowCardinality(String) CODEC(ZSTD(1)),
    SeverityNumber   UInt8,
    ServiceName      LowCardinality(String) CODEC(ZSTD(1)),
    Body             String CODEC(ZSTD(1)),
    ResourceSchemaUrl LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeSchemaUrl   LowCardinality(String) CODEC(ZSTD(1)),
    ScopeName        String CODEC(ZSTD(1)),
    ScopeVersion     LowCardinality(String) CODEC(ZSTD(1)),
    ScopeAttributes  Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    LogAttributes    Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    EventName        String CODEC(ZSTD(1)),

    INDEX idx_trace_id       TraceId                     TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key    mapKeys(ResourceAttributes)  TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_res_attr_value  mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_scope_attr_key  mapKeys(ScopeAttributes)    TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_scope_attr_value mapValues(ScopeAttributes)  TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_log_attr_key    mapKeys(LogAttributes)      TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_log_attr_value  mapValues(LogAttributes)    TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_body            Body  TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 8  -- full-text search

) ENGINE = %s
PARTITION BY toDate(TimestampTime)
PRIMARY KEY (ServiceName, TimestampTime)
ORDER BY (ServiceName, TimestampTime, Timestamp)
%s
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
```

**Ponto importante:** o `idx_body` usa `tokenbf_v1` (token bloom filter), que permite buscas por palavras no `Body` sem full scan. Granularidade = 8 (mais cobertura por index entry, menos preciso mas mais compacto).

---

### 1.3 Metrics — `signoz_metrics`

**Tabelas:**

```go
// pkg/telemetrymetrics/tables.go
SamplesV4TableName         = "distributed_samples_v4"           // dados brutos
SamplesV4Agg5mTableName    = "distributed_samples_v4_agg_5m"   // agregado 5min
SamplesV4Agg30mTableName   = "distributed_samples_v4_agg_30m"  // agregado 30min
ExpHistogramTableName      = "distributed_exp_hist"             // exponential histograms

TimeseriesV4TableName      = "distributed_time_series_v4"       // < 6h
TimeseriesV46hrsTableName  = "distributed_time_series_v4_6hrs"  // 6h–1d
TimeseriesV41dayTableName  = "distributed_time_series_v4_1day"  // 1d–1w
TimeseriesV41weekTableName = "distributed_time_series_v4_1week" // > 1w

UpdatedMetadataTableName   = "distributed_updated_metadata"
AttributesMetadataTableName = "distributed_metadata"
```

**DDL de samples (gauge/sum):**

```sql
-- metrics_gauge_table.sql / metrics_sum_table.sql
CREATE TABLE IF NOT EXISTS "%s"."%s" %s (
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ResourceSchemaUrl  String CODEC(ZSTD(1)),
    ScopeName          String CODEC(ZSTD(1)),
    ScopeVersion       String CODEC(ZSTD(1)),
    ScopeAttributes    Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeDroppedAttrCount UInt32 CODEC(ZSTD(1)),
    ScopeSchemaUrl     String CODEC(ZSTD(1)),
    ServiceName        LowCardinality(String) CODEC(ZSTD(1)),
    MetricName         String CODEC(ZSTD(1)),
    MetricDescription  String CODEC(ZSTD(1)),
    MetricUnit         String CODEC(ZSTD(1)),
    Attributes         Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    StartTimeUnix      DateTime64(9) CODEC(Delta, ZSTD(1)),
    TimeUnix           DateTime64(9) CODEC(Delta, ZSTD(1)),
    Value              Float64 CODEC(ZSTD(1)),
    Flags              UInt32 CODEC(ZSTD(1)),
    Exemplars Nested (
        FilteredAttributes Map(LowCardinality(String), String),
        TimeUnix           DateTime64(9),
        Value              Float64,
        SpanId             String,
        TraceId            String
    ) CODEC(ZSTD(1)),
    -- Para sum metrics: AggregationTemporality Int32, IsMonotonic Boolean CODEC(Delta, ZSTD(1))

    INDEX idx_res_attr_key    mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_attr_value  mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_scope_attr_key  mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_attr_key        mapKeys(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_attr_value      mapValues(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1

) ENGINE = %s
PARTITION BY toDate(TimeUnix)
ORDER BY (ServiceName, MetricName, Attributes, toUnixTimestamp64Nano(TimeUnix))
SETTINGS index_granularity=8192, ttl_only_drop_parts = 1
```

**Lógica de qual tabela usar por time range:**

```go
// pkg/telemetrymetrics/tables.go — WhichSamplesTableToUse()
// < 1 day + offset   → distributed_samples_v4          (dados brutos, coluna "value")
// < 1 week + offset  → distributed_samples_v4_agg_5m   (coluna "last", "sum", "count", "min", "max")
// >= 1 week + offset → distributed_samples_v4_agg_30m  (mesmas colunas agregadas)

// WhichTSTableToUse() para time series:
// < 6h   → distributed_time_series_v4        (start ajustado ao nearest 1h)
// < 1d   → distributed_time_series_v4_6hrs   (start ajustado ao nearest 6h)
// < 1w   → distributed_time_series_v4_1day   (start ajustado ao nearest 1d)
// >= 1w  → distributed_time_series_v4_1week  (start ajustado ao nearest 1w)
```

**Coluna de valor por tabela:**

```go
// ValueColumnForSamplesTable()
// distributed_samples_v4_agg_5m  → "last"
// distributed_samples_v4_agg_30m → "last"
// qualquer outra                  → "value"

// CountExpressionForSamplesTable()
// samples_v4, exp_hist → "count(*)"
// agg_5m, agg_30m      → "sum(count)"
```

---

### Resumo de Codecs e Otimizações

| Tipo de dado | Codec usado | Motivo |
|---|---|---|
| Timestamps | `Delta(8), ZSTD(1)` | Timestamps sequenciais comprimem muito com delta |
| Timestamps em métricas | `Delta, ZSTD(1)` | Idem |
| Strings repetitivas | `LowCardinality(String)` | Dictionary encoding, evita repetição |
| Maps de atributos | `ZSTD(1)` | Compressão geral |
| Body (logs) | `ZSTD(1)` | Texto livre, compressão geral |
| Booleanos | `Delta, ZSTD(1)` | Delta funciona bem em bits sequenciais |

| Tipo de index | Usado em | Granularity | Efeito |
|---|---|---|---|
| `bloom_filter(0.001)` | TraceId | 1 | Alta precisão, poucos falsos positivos |
| `bloom_filter(0.01)` | mapKeys/mapValues de atributos | 1 | Filtra granules sem escanear |
| `minmax` | Duration (traces) | 1 | Range queries em duração |
| `tokenbf_v1(32768, 3, 0)` | Body (logs) | 8 | Full-text search por tokens |

---

## 2. Pipeline de Ingestão

### Arquitetura

```
OTel Collector
    ↓ (ClickHouse Exporter — contrib)
ClickHouse (escrita direta)

SignOz Server (query-service)
    ↓ (leitura apenas)
ClickHouse (queries)
```

**O SignOz Server NÃO está no caminho da ingestão.** O dado vai direto do Collector para o ClickHouse via `clickhouseexporter` do `opentelemetry-collector-contrib`.

O `query-service` é **somente leitura** — ele recebe queries do frontend e executa SELECTs no ClickHouse via `TelemetryStore`.

### Exporter: como o Collector escreve

Registro do exporter com suporte a Logs, Traces e Metrics:

```go
// exporter/clickhouseexporter/factory.go
func NewFactory() exporter.Factory {
    return exporter.NewFactory(
        metadata.Type,
        createDefaultConfig,
        exporter.WithLogs(createLogsExporter, metadata.LogsStability),
        exporter.WithTraces(createTracesExporter, metadata.TracesStability),
        exporter.WithMetrics(createMetricExporter, metadata.MetricsStability),
    )
}

func createTracesExporter(...) (exporter.Traces, error) {
    return exporterhelper.NewTraces(
        ctx, set, cfg,
        exp.pushTraceData,
        exporterhelper.WithStart(exp.start),
        exporterhelper.WithShutdown(exp.shutdown),
        exporterhelper.WithTimeout(c.TimeoutSettings),
        exporterhelper.WithQueue(c.QueueSettings),   // fila interna assíncrona
        exporterhelper.WithRetry(c.BackOffConfig),   // retry com backoff exponencial
    )
}
```

### Escrita: assíncrona com batch

A escrita é **assíncrona** (via fila do `exporterhelper`) e em **batch** (via `PrepareBatch`):

```go
// exporter/clickhouseexporter/exporter_traces.go — pushTraceData()
func (e *tracesExporter) pushTraceData(ctx context.Context, td ptrace.Traces) error {
    batch, err := e.db.PrepareBatch(ctx, e.insertSQL)  // abre batch
    // ...
    defer batch.Close()

    // itera sobre todos os ResourceSpans → ScopeSpans → Spans
    for i := range rsSpans.Len() {
        // ...
        appendErr := batch.Append(
            span.StartTimestamp().AsTime(),
            traceutil.TraceIDToHexOrEmptyString(span.TraceID()),
            traceutil.SpanIDToHexOrEmptyString(span.SpanID()),
            // ... todos os campos
        )
    }

    // uma única chamada de rede para todos os spans do batch
    if sendErr := batch.Send(); sendErr != nil {
        return fmt.Errorf("traces insert failed: %w", sendErr)
    }
}
```

O mesmo padrão `PrepareBatch → Append → Send` é usado para logs e metrics.

### INSERT SQL gerado

```sql
-- sqltemplates/traces_insert.sql
INSERT INTO %q.%q (
    Timestamp, TraceId, SpanId, ParentSpanId, TraceState,
    SpanName, SpanKind, ServiceName, ResourceAttributes,
    ScopeName, ScopeVersion, SpanAttributes, Duration,
    StatusCode, StatusMessage,
    Events.Timestamp, Events.Name, Events.Attributes,
    Links.TraceId, Links.SpanId, Links.TraceState, Links.Attributes
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

### Conexão do Query-Service com ClickHouse

O `query-service` abre sua própria conexão de leitura:

```go
// pkg/telemetrystore/clickhousetelemetrystore/provider.go
func New(ctx context.Context, ...) (telemetrystore.TelemetryStore, error) {
    options, err := clickhouse.ParseDSN(config.Clickhouse.DSN)
    options.MaxIdleConns = config.Connection.MaxIdleConns
    options.MaxOpenConns = config.Connection.MaxOpenConns
    options.DialTimeout  = config.Connection.DialTimeout
    // evita problemas de decode em colunas JSON
    options.Settings["output_format_native_write_json_as_string"] = 1

    chConn, err := clickhouse.Open(options)
    // ...
    return &provider{clickHouseConn: chConn, cluster: config.Clickhouse.Cluster}, nil
}

// Query envolve hooks antes/depois (observability, logging de queries lentas, etc.)
func (p *provider) Query(ctx context.Context, query string, args ...interface{}) (driver.Rows, error) {
    event := telemetrystore.NewQueryEvent(query, args)
    ctx = telemetrystore.WrapBeforeQuery(p.hooks, ctx, event)
    rows, err := p.clickHouseConn.Query(ctx, query, args...)
    // ...
}
```

---

## 3. Frontend — Como Lê os Dados

### Sem client ClickHouse no browser

O frontend **nunca** conecta diretamente no ClickHouse. Toda comunicação é via REST API para o `query-service` Go.

### Endpoints de query

Definidos em [`pkg/query-service/app/http_handler.go`](../../otel/signoz/pkg/query-service/app/http_handler.go):

**Métricas:**
```
POST /api/v3/query_range          → QueryRangeV3 (métricas, logs, traces agregados)
POST /api/v3/query_range/format   → QueryRangeV3Format
POST /api/v4/query_range          → QueryRangeV4
GET  /api/v4/metric/metric_metadata
GET  /api/v1/query_range          → queryRangeMetrics (Prometheus-compat)
GET  /api/v1/query                → queryMetrics (Prometheus instant)
```

**Traces:**
```
GET  /api/v1/traces/{traceId}                      → SearchTraces
GET  /api/v2/traces/fields                          → traceFields
POST /api/v2/traces/fields                          → updateTraceField
POST /api/v2/traces/flamegraph/{traceId}            → GetFlamegraphSpansForTrace
POST /api/v2/traces/waterfall/{traceId}             → GetWaterfallSpansForTraceWithMetadata
POST /api/v1/service/top_operations
POST /api/v1/service/top_level_operations
POST /api/v2/service/top_operations
POST /api/v1/dependency_graph
```

**Logs:**
```
GET  /logs                        → getLogs
GET  /logs/fields                 → logFields
POST /logs/fields                 → logFieldUpdate
GET  /logs/aggregate              → logAggregate
GET  /logs/livetail               → QueryRawStream (WebSocket/streaming)
POST /logs/pipelines/preview
```

**Serviços e infra:**
```
POST /api/v1/services
POST /api/v2/services
GET  /api/v1/services/list
POST /api/v1/hosts, /processes, /pods, /nodes, /namespaces, /clusters, /deployments, ...
```

**Dashboard e variáveis:**
```
POST /api/v2/variables/query      → queryDashboardVarsV2
GET  /api/v1/dashboards
POST /api/v1/dashboards
GET  /api/v1/explorer/views
```

**TTL e settings:**
```
POST /api/v1/settings/ttl
GET  /api/v1/settings/ttl
POST /api/v2/settings/ttl         → custom retention por tabela
GET  /api/v2/settings/ttl
```

### Fluxo completo de uma query

```
Frontend (React/TypeScript)
  │
  │  POST /api/v3/query_range { query: { ... }, start, end, step }
  ▼
http_handler.go — QueryRangeV3()
  │
  │  converte o payload para ClickHouse SQL via QueryBuilder
  ▼
clickhouseReader/reader.go
  │
  │  SELECT ... FROM signoz_traces.distributed_signoz_index_v3
  │  WHERE ServiceName = ? AND toDateTime(Timestamp) BETWEEN ? AND ?
  ▼
TelemetryStore (clickhousetelemetrystore/provider.go)
  │
  │  p.clickHouseConn.Query(ctx, sql, args...)
  ▼
ClickHouse
  │
  └─ resultado em rows → serializado como JSON → devolvido pro frontend
```

---

## Referências de Código

| Arquivo | Conteúdo |
|---|---|
| [`pkg/telemetrytraces/tables.go`](../../otel/signoz/pkg/telemetrytraces/tables.go) | Nomes de todas as tabelas de traces |
| [`pkg/telemetrylogs/tables.go`](../../otel/signoz/pkg/telemetrylogs/tables.go) | Nomes de todas as tabelas de logs |
| [`pkg/telemetrymetrics/tables.go`](../../otel/signoz/pkg/telemetrymetrics/tables.go) | Nomes e lógica de seleção de tabela de métricas |
| [`exporter/clickhouseexporter/factory.go`](../../otel/opentelemetry-collector-contrib/exporter/clickhouseexporter/factory.go) | Registro do exporter com Queue + Retry |
| [`exporter/clickhouseexporter/exporter_traces.go`](../../otel/opentelemetry-collector-contrib/exporter/clickhouseexporter/exporter_traces.go) | `pushTraceData`: batch write no ClickHouse |
| [`exporter/clickhouseexporter/internal/sqltemplates/traces_table.sql`](../../otel/opentelemetry-collector-contrib/exporter/clickhouseexporter/internal/sqltemplates/traces_table.sql) | DDL da tabela de traces |
| [`exporter/clickhouseexporter/internal/sqltemplates/logs_table.sql`](../../otel/opentelemetry-collector-contrib/exporter/clickhouseexporter/internal/sqltemplates/logs_table.sql) | DDL da tabela de logs |
| [`exporter/clickhouseexporter/internal/sqltemplates/metrics_gauge_table.sql`](../../otel/opentelemetry-collector-contrib/exporter/clickhouseexporter/internal/sqltemplates/metrics_gauge_table.sql) | DDL da tabela de métricas |
| [`exporter/clickhouseexporter/internal/sqltemplates/traces_id_ts_lookup_mv.sql`](../../otel/opentelemetry-collector-contrib/exporter/clickhouseexporter/internal/sqltemplates/traces_id_ts_lookup_mv.sql) | Materialized View de lookup por TraceId |
| [`pkg/telemetrystore/clickhousetelemetrystore/provider.go`](../../otel/signoz/pkg/telemetrystore/clickhousetelemetrystore/provider.go) | Conexão de leitura do query-service |
| [`pkg/query-service/app/http_handler.go`](../../otel/signoz/pkg/query-service/app/http_handler.go) | Todos os endpoints REST da API |
