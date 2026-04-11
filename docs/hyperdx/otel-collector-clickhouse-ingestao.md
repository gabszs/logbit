# OTel Collector → ClickHouse: ingestão, schemas e setup

## 1) Quem salva os dados — coletor ou API?

O coletor salva diretamente no ClickHouse. A API não participa do caminho de escrita.

```
Aplicação → OTel Collector → ClickHouse
                                  ↑
                          API/UI lê daqui
                          (apenas leitura)
```

O exporter `clickhouse` dentro do `otelcol-contrib` abre uma conexão native TCP diretamente no ClickHouse e grava os dados. A API Express (`packages/api`) só consulta o ClickHouse para servir a UI — ela nunca recebe telemetria.

Essa separação faz sentido: o coletor tem batching, retry e controle de memória nativos. Passar pela API adicionaria latência e um ponto de falha desnecessário no caminho de alta frequência.

---

## 2) Onde o exporter ClickHouse está implementado

**Não está neste repositório.** O HyperDX usa a imagem oficial `otel/opentelemetry-collector-contrib` e copia o binário dela:

```dockerfile
FROM otel/opentelemetry-collector-contrib:0.147.0 AS col
...
COPY --from=col --chmod=755 /otelcol-contrib /otelcontribcol
```

O exporter ClickHouse é código Go do projeto upstream [open-telemetry/opentelemetry-collector-contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter). O HyperDX apenas o configura via YAML e orquestra o container.

O que o HyperDX **de fato implementa** em relação ao ClickHouse:

| O que é | Onde está |
|---|---|
| Config do coletor (receivers, exporters, pipelines) | `docker/otel-collector/config.standalone.yaml` |
| Ferramenta de migração de schema | `packages/otel-collector/cmd/migrate/main.go` |
| SQLs de criação das tabelas customizadas | `docker/otel-collector/schema/seed/` |
| Geração dinâmica de config via OpAMP | `packages/api/src/opamp/controllers/opampController.ts` |

---

## 3) Schemas: dois modos, dois schemas diferentes

### Modo legacy (`create_schema: true`)

O próprio exporter upstream cria as tabelas com seu schema interno. Nenhuma customização do HyperDX. É o modo ativo no `docker-compose.yml` OSS (`HYPERDX_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA=true`).

### Modo seed (`create_schema: false`)

O `migrate` tool do HyperDX roda os SQLs em `schema/seed/` — **esses são custom**. Diferenças em relação ao schema padrão:

**Colunas exclusivas do HyperDX:**
```sql
-- Logs: coluna de conveniência para TTL e partição
`TimestampTime` DateTime DEFAULT toDateTime(Timestamp),

-- Colunas materializadas para filtros rápidos sem mapKeys/mapValues
`__hdx_materialized_k8s.cluster.name`              MATERIALIZED ResourceAttributes['k8s.cluster.name'],
`__hdx_materialized_k8s.container.name`            MATERIALIZED ResourceAttributes['k8s.container.name'],
`__hdx_materialized_k8s.namespace.name`            MATERIALIZED ResourceAttributes['k8s.namespace.name'],
`__hdx_materialized_k8s.pod.name`                  MATERIALIZED ResourceAttributes['k8s.pod.name'],
`__hdx_materialized_deployment.environment.name`   MATERIALIZED ResourceAttributes['deployment.environment.name'],

-- Traces: materializado para RUM
`__hdx_materialized_rum.sessionId`  MATERIALIZED ResourceAttributes['rum.sessionId'],
`SampleRate`                        MATERIALIZED greatest(toUInt64OrZero(SpanAttributes['SampleRate']), 1),
```

**Índices extras:**
```sql
INDEX idx_trace_id       TraceId         TYPE bloom_filter(0.001),
INDEX idx_res_attr_key   mapKeys(...)    TYPE bloom_filter(0.01),
INDEX idx_res_attr_value mapValues(...)  TYPE bloom_filter(0.01),
INDEX idx_lower_body     lower(Body)     TYPE tokenbf_v1(32768, 3, 0),  -- busca textual
INDEX idx_duration       Duration        TYPE minmax,
```

| | Schema padrão upstream | Schema seed HyperDX |
|---|---|---|
| Colunas base OTel | sim | sim |
| `TimestampTime` | não | sim |
| `__hdx_materialized_*` | não | sim |
| Bloom filters / tokenbf | não | sim |
| Quem cria | exporter | `migrate` tool |
| Usado no OSS hoje | sim (`legacy=true`) | não (mas é o destino) |

---

## 4) JSON type support (beta)

### O que é

O ClickHouse 25.3+ tem um tipo nativo `JSON` que substitui `Map(LowCardinality(String), String)`. Com ele, subcampos são acessados diretamente com tipos inferidos, sem precisar de `mapKeys`/`mapValues`.

### Como ativar

Duas variáveis de ambiente precisam ser setadas:

```yaml
otel-collector:
  command: ["--config", "/etc/otelcol-contrib/config.yaml", "--feature-gates=clickhouse.json"]

app:
  environment:
    BETA_CH_OTEL_JSON_SCHEMA_ENABLED: true
```

### O que muda no schema

| Coluna | Modo Map (padrão) | Modo JSON (beta) |
|---|---|---|
| `ResourceAttributes` | `Map(LowCardinality(String), String)` | `JSON` |
| `LogAttributes` | `Map(LowCardinality(String), String)` | `JSON` |
| `SpanAttributes` | `Map(LowCardinality(String), String)` | `JSON` |
| `__hdx_materialized_*` | sim | **não existe** |
| `TimestampTime` | sim | **não existe** |
| Bloom filters / tokenbf | sim | **não** |
| Quem cria o schema | `migrate` tool (HyperDX) | exporter upstream |

### O que acontece internamente ao ativar

`entrypoint.sh` detecta o feature gate e força `create_schema: true`, pulando os seed SQLs:

```sh
# entrypoint.sh
if echo "$OTEL_AGENT_FEATURE_GATE_ARG" | grep -q "clickhouse.json"; then
  export HYPERDX_OTEL_EXPORTER_CREATE_LEGACY_SCHEMA=true
fi
```

Os próprios devs do HyperDX registraram no código:
```sh
# We don't have a JSON schema yet, so let's let the collector create the tables
```

O `DEFAULT_SOURCES` também muda: `timestampValueExpression` de logs passa de `"TimestampTime"` → `"Timestamp"` porque a coluna `TimestampTime` não existe no schema JSON.

---

## 5) Setup local: ClickHouse + OTel Collector Contrib

### compose.yaml

```yaml
clickhouse:
  image: clickhouse/clickhouse-server:25.3
  environment:
    CLICKHOUSE_USER: default
    CLICKHOUSE_PASSWORD: "clickhouse"
    CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1
  ports:
    - "8123:8123"  # HTTP (UI / queries)
    - "9000:9000"  # Native TCP (collector)
  ulimits:
    nofile:
      soft: 262144
      hard: 262144
  healthcheck:
    test: ["CMD", "clickhouse-client", "--password", "clickhouse", "--query", "SELECT 1"]
    interval: 5s
    timeout: 5s
    retries: 10
    start_period: 10s

otel-collector:
  image: otel/opentelemetry-collector-contrib:0.147.0
  command: ["--config", "/etc/otelcol-contrib/config.yaml"]
  # Para JSON type: adicionar "--feature-gates=clickhouse.json"
  volumes:
    - ./apps/otel-collector/config.yaml:/etc/otelcol-contrib/config.yaml:ro
  ports:
    - "4327:4317"  # gRPC
    - "4328:4318"  # HTTP
  depends_on:
    clickhouse:
      condition: service_healthy
```

### apps/otel-collector/config.yaml

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"
      http:
        endpoint: "0.0.0.0:4318"
        cors:
          allowed_origins: ["*"]
          allowed_headers: ["*"]

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  batch:
    timeout: 5s
    send_batch_size: 1000

exporters:
  clickhouse:
    endpoint: tcp://clickhouse:9000
    database: default
    username: default
    password: "clickhouse"
    timeout: 5s
    create_schema: true
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
```

### Tabelas criadas automaticamente (`create_schema: true`)

O exporter cria as tabelas na primeira vez que recebe dados de cada tipo:

- `default.otel_logs`
- `default.otel_traces`
- `default.otel_metrics_gauge`
- `default.otel_metrics_sum`
- `default.otel_metrics_histogram`
- `default.otel_metrics_exponential_histogram`
- `default.otel_metrics_summary`

Para verificar:
```bash
curl "http://localhost:8123/?password=clickhouse&query=SHOW+TABLES+IN+default"
```

---

## 6) Problema conhecido: TTL com JSON type

### Erro

Ao ativar `--feature-gates=clickhouse.json`, o exporter falha ao criar as tabelas:

```
failed to start "clickhouse" exporter: exec create logs json table sql:
code: 450, message: TTL expression result column should have DateTime or Date type,
but has DateTime64(9)
```

### Causa

No schema JSON, o exporter usa `Timestamp` (`DateTime64(9)`) diretamente na cláusula `TTL`. O ClickHouse exige `DateTime` ou `Date` no resultado da expressão TTL.

### Solução

Remover o `ttl` da config do exporter. Sem o campo, o exporter cria as tabelas sem cláusula TTL:

```yaml
exporters:
  clickhouse:
    # ttl: 720h  ← remover este campo ao usar clickhouse.json
```

Após corrigir a config, dropar as tabelas que ficaram parcialmente criadas e recriar o container do coletor.
