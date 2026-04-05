# Análise completa — arquitetura de telemetria HyperDX (coletor → ClickHouse)

## Escopo desta análise
Este documento cobre **do coletor em diante**: ingestão OTLP, processamento no OpenTelemetry Collector, exportação para ClickHouse, criação/evolução de schemas e consumo posterior pelos sources do HyperDX.

Baseado em (paths de referência):
- [otel/hyperdx/docker/otel-collector/config.yaml](../otel/hyperdx/docker/otel-collector/config.yaml)
- [otel/hyperdx/docker/otel-collector/config.standalone.yaml](../otel/hyperdx/docker/otel-collector/config.standalone.yaml)
- [otel/hyperdx/docker/otel-collector/config.standalone.auth.yaml](../otel/hyperdx/docker/otel-collector/config.standalone.auth.yaml)
- [otel/hyperdx/packages/api/src/opamp/controllers/opampController.ts](../otel/hyperdx/packages/api/src/opamp/controllers/opampController.ts)
- [otel/hyperdx/docker/otel-collector/entrypoint.sh](../otel/hyperdx/docker/otel-collector/entrypoint.sh)
- [otel/hyperdx/packages/otel-collector/cmd/migrate/main.go](../otel/hyperdx/packages/otel-collector/cmd/migrate/main.go)
- [otel/hyperdx/docker/otel-collector/schema/seed/00001_create_database.sql](../otel/hyperdx/docker/otel-collector/schema/seed/00001_create_database.sql)
- [otel/hyperdx/docker/otel-collector/schema/seed/00002_otel_logs.sql](../otel/hyperdx/docker/otel-collector/schema/seed/00002_otel_logs.sql)
- [otel/hyperdx/docker/otel-collector/schema/seed/00003_otel_metrics.sql](../otel/hyperdx/docker/otel-collector/schema/seed/00003_otel_metrics.sql)
- [otel/hyperdx/docker/otel-collector/schema/seed/00004_hyperdx_sessions.sql](../otel/hyperdx/docker/otel-collector/schema/seed/00004_hyperdx_sessions.sql)
- [otel/hyperdx/docker/otel-collector/schema/seed/00005_otel_traces.sql](../otel/hyperdx/docker/otel-collector/schema/seed/00005_otel_traces.sql)
- [otel/hyperdx/docker-compose.yml](../otel/hyperdx/docker-compose.yml)

---

## 1) Visão arquitetural (coletor para frente)

## Fluxo de dados
1. Aplicações enviam telemetria via OTLP (`4317` gRPC / `4318` HTTP).
2. Collector recebe em `otlp/hyperdx` (com `include_metadata: true`).
3. Logs passam por `routing/logs`:
   - logs comuns → pipeline `logs/out-default` → `clickhouse` (tabela de logs padrão)
   - logs com `attributes["rr-web.event"]` → `logs/out-rrweb` → `clickhouse/rrweb` (tabela de sessão)
4. Traces e métricas vão direto para `clickhouse`.
5. Exporter ClickHouse grava em tabelas MergeTree (logs, traces, sessions, métricas).
6. API/Frontend consultam essas tabelas via **connections/sources** configurados por time.

---

## 2) Modos de configuração do coletor

## A) Standalone (arquivo estático)
- Sem `OPAMP_SERVER_URL`: collector sobe com
  - `config.yaml` (processors/extensions base)
  - `standalone-config.yaml` (receivers/pipelines/exporters)
  - opcional `standalone-auth-config.yaml` quando `OTLP_AUTH_TOKEN` existe
  - opcional `CUSTOM_OTELCOL_CONFIG_FILE`

## B) Supervisor + OpAMP (config remota por API)
- Com `OPAMP_SERVER_URL`: supervisor busca config da API (`/v1/opamp`).
- `buildOtelCollectorConfig()` gera pipeline dinamicamente com:
  - tokens de ingestão por time (`apiKey`)
  - autenticação de collector opcional (`collectorAuthenticationEnforced`)
  - exporters `clickhouse` e `clickhouse/rrweb`

---

## 3) Segurança/autenticação da ingestão

- Quando `collectorAuthenticationEnforced` está ativo:
  - extensão `bearertokenauth/hyperdx` é criada
  - receivers OTLP (HTTP+gRPC) exigem token bearer
- Em dev/all-in-one, `INGESTION_API_KEY` também pode ser aceito.
- Sem enforcement, OTLP pode operar sem token (depende do ambiente).

---

## 4) Processamento no collector antes de persistir

## Processors principais
- `transform` (logs):
  - tenta parse de JSON do body e merge em `log.attributes`
  - faz inferência de severidade (`fatal/error/warn/debug/trace/info`) se vier vazia
  - normaliza `severity_text` para lowercase
- `resourcedetection`: `env`, `system`, `docker`
- `memory_limiter`: proteção de memória
- `batch`: batching para eficiência de exportação

## Roteamento de logs
- Connector `routing/logs` com regra:
  - `IsMatch(attributes["rr-web.event"], ".*")` → `logs/out-rrweb`
  - caso contrário → `logs/out-default`

---

## 5) Exportação ClickHouse

## Exporters
- `clickhouse` (principal): traces, métricas e logs padrão
- `clickhouse/rrweb` (sessões): logs de sessão em `hyperdx_sessions`

Parâmetros relevantes:
- `endpoint`: `${env:CLICKHOUSE_ENDPOINT}`
- `database`: `${env:HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE}`
- `username/password`: env vars
- `ttl`: `${env:HYPERDX_OTEL_EXPORTER_TABLES_TTL:-720h}`
- `retry_on_failure`: habilitado (5s → 30s, até 300s)
- `create_schema`: `${env:HYPERDX_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA:-false}`

---

## 6) Lifecycle de schema (seed/migração)

No startup (`entrypoint.sh`):
- Se `HYPERDX_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA != true`, executa `migrate /etc/otel/schema/seed`.
- Tool `migrate` (Go) faz:
  1. conexão ClickHouse (native/http, TLS opcional)
  2. parse de TTL (`30d`, `720h`, etc) → expressão ClickHouse (`toIntervalDay/Hour/...`)
  3. substituição de macros `${DATABASE}` e `${TABLES_TTL}` em SQL
  4. `goose.UpContext(..., WithNoVersioning())` com retry exponencial

Observação importante:
- No `docker-compose.yml` do OSS atual, `HYPERDX_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA: 'true'` está setado no serviço `otel-collector`.
- Isso indica que, nesse compose, a criação de schema pode seguir o modo “legacy do exporter” em vez dos SQLs seed.

---

## 7) Schemas ClickHouse (seed SQL)

## 7.1 Database
### `00001_create_database.sql`
```sql
CREATE DATABASE IF NOT EXISTS ${DATABASE};
```

## 7.2 Logs — `otel_logs`
### Tabela
- engine: `MergeTree`
- partition: `toDate(TimestampTime)`
- primary key: `(ServiceName, TimestampTime)`
- order by: `(ServiceName, TimestampTime, Timestamp)`
- ttl: `TimestampTime + ${TABLES_TTL}`

### Colunas principais
- tempo/contexto: `Timestamp`, `TimestampTime`
- correlação: `TraceId`, `SpanId`, `TraceFlags`
- severidade: `SeverityText`, `SeverityNumber`
- identidade: `ServiceName`, `Body`
- atributos OTEL: `ResourceAttributes`, `ScopeAttributes`, `LogAttributes`

### Colunas materializadas
- `__hdx_materialized_k8s.cluster.name`
- `__hdx_materialized_k8s.container.name`
- `__hdx_materialized_k8s.deployment.name`
- `__hdx_materialized_k8s.namespace.name`
- `__hdx_materialized_k8s.node.name`
- `__hdx_materialized_k8s.pod.name`
- `__hdx_materialized_k8s.pod.uid`
- `__hdx_materialized_deployment.environment.name`

### Índices
- `idx_trace_id` bloom
- índices de map keys/values para Resource/Scope/Log attributes
- `idx_lower_body` tokenbf para busca textual

## 7.3 Sessions — `hyperdx_sessions`
Estrutura quase espelho de logs, dedicada a eventos de sessão (rrweb):
- engine/partition/key/order/ttl iguais ao padrão de logs
- colunas: `Timestamp*`, `TraceId`, `SpanId`, severidade, `ServiceName`, `Body`, maps de atributos
- índices: trace, maps e tokenbf em body

## 7.4 Traces — `otel_traces`
### Tabela
- engine: `MergeTree`
- partition: `toDate(Timestamp)`
- order by: `(ServiceName, SpanName, toDateTime(Timestamp))`
- ttl: `toDate(Timestamp) + ${TABLES_TTL}`

### Colunas principais
- IDs/span: `TraceId`, `SpanId`, `ParentSpanId`, `TraceState`
- semântica: `SpanName`, `SpanKind`, `ServiceName`
- atributos: `ResourceAttributes`, `SpanAttributes`
- status/latência: `Duration`, `StatusCode`, `StatusMessage`
- arrays OTEL: `Events.*`, `Links.*`

### Colunas materializadas
- `__hdx_materialized_rum.sessionId` = `ResourceAttributes['rum.sessionId']`
- `SampleRate` = `greatest(toUInt64OrZero(SpanAttributes['SampleRate']), 1)`

### Índices
- `idx_trace_id`, `idx_rum_session_id`
- map indexes para Resource/Span attributes
- `idx_duration` minmax
- `idx_lower_span_name` tokenbf

## 7.5 Métricas
As métricas são separadas por tipo OTEL em tabelas distintas:

1. `otel_metrics_gauge`
2. `otel_metrics_sum`
3. `otel_metrics_histogram`
4. `otel_metrics_exponential_histogram`
5. `otel_metrics_summary`

### Padrão comum (todas)
- engine: `MergeTree`
- partition: `toDate(TimeUnix)`
- order by: `(ServiceName, MetricName, Attributes, toUnixTimestamp64Nano(TimeUnix))`
- ttl: `toDateTime(TimeUnix) + ${TABLES_TTL}`
- índices bloom para map keys/values de:
  - `ResourceAttributes`
  - `ScopeAttributes`
  - `Attributes`

### Campos comuns relevantes
- recurso/scope: `ResourceAttributes`, `ScopeName`, `ScopeVersion`, `ScopeAttributes`
- identidade métrica: `MetricName`, `MetricDescription`, `MetricUnit`
- dimensão: `Attributes`
- tempo: `StartTimeUnix`, `TimeUnix`

### Campos específicos por tipo
- Gauge/Sum: `Value`, exemplars arrays
- Sum: `AggregationTemporality`, `IsMonotonic`
- Histogram: `Count`, `Sum`, `BucketCounts`, `ExplicitBounds`, `Min`, `Max`, `AggregationTemporality`
- Exponential Histogram: `Scale`, `ZeroCount`, buckets positivos/negativos, `Min/Max`
- Summary: `Count`, `Sum`, `ValueAtQuantiles.Quantile`, `ValueAtQuantiles.Value`

---

## 8) Como a API/UI “enxerga” esses dados

No bootstrap de time (`DEFAULT_SOURCES` no compose), HyperDX cria fontes mapeadas para ClickHouse:
- Logs → `default.otel_logs`
- Traces → `default.otel_traces`
- Metrics → tabelas `otel_metrics_*` (gauge/histogram/sum)
- Sessions → `default.hyperdx_sessions`

Cada source traz expressões de timestamp/atributos/traceId/spanId que orientam a query layer da aplicação.

---

## 9) Pontos de atenção operacionais

1. **Legacy schema vs seed schema**
   - Compose OSS define `HYPERDX_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA=true`.
   - Se quiser padronizar no seed SQL versionado, ajustar esse flag para `false`.

2. **TTL real de retenção**
   - TTL vem de `HYPERDX_OTEL_EXPORTER_TABLES_TTL`.
   - Impacta custo, performance e janela de busca histórica.

3. **Autenticação de ingestão**
   - Em produção, ideal manter `collectorAuthenticationEnforced` ativo com rotação de apiKey.

4. **Índices tokenbf e maps**
   - Ajudam busca textual/filtros por atributos, mas precisam monitoramento de cardinalidade e custos de armazenamento.

---

## 10) Resumo executivo

A arquitetura HyperDX, do coletor em diante, é um pipeline OTEL clássico com especialização para sessão (rrweb):
- ingestão OTLP (opcionalmente autenticada)
- transformação/normalização de logs
- roteamento de logs de sessão para tabela dedicada
- persistência em ClickHouse MergeTree com TTL, índices e colunas materializadas para aceleração
- consumo via sources configurados para logs/traces/metrics/sessions.

Os schemas seed fornecem modelagem explícita e otimizada para observabilidade, porém o compose OSS atual ainda aponta para modo legacy de criação de schema no exporter.
