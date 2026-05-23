# Coleta, ingestao e storage de telemetria

## Usa OpenTelemetry?

Sim. O Monoscope e OpenTelemetry-native:

- Recebe OTLP/gRPC no backend.
- Gera codigos dos protos OTLP com `proto-lens`.
- Implementa services de logs, traces e metrics em `src/Opentelemetry/OtlpServer.hs`.
- Tem configs de OpenTelemetry Collector em `static/public/otelcol.yaml` e `static/public/internal-otelcol.yml`.
- Instrumenta o proprio servidor HTTP com OpenTelemetry WAI middleware.

## Caminhos de ingestao

Existem tres caminhos principais:

1. Cliente/SDK/Collector -> backend Monoscope OTLP/gRPC -> storage.
2. Cliente/Collector -> Kafka -> backend Monoscope Kafka consumer -> storage.
3. Mensagens legadas/PubSub -> backend PubSub consumer -> conversao para span -> storage.

No docker-compose local, o servico Monoscope expoe `8080` para HTTP e `4317` para gRPC/OTLP.

## Collector salva direto?

Pelo codigo analisado, nao. O collector nao grava direto em banco nem S3. Ele envia para:

- O backend Monoscope por OTLP, no caso simples/local.
- Kafka, no `static/public/otelcol.yaml` de producao/coleta, e depois o backend consome.

Quem persiste a telemetria e o backend Monoscope.

## Fluxo OTLP direto

`src/System/Server.hs` inicia `OtlpServer.runServer`. Dentro de `src/Opentelemetry/OtlpServer.hs`, os handlers:

- Extraem API key de metadata gRPC/header (`authorization`, `x-api-key`, `at-project-key`).
- Decodificam traces/logs/metrics OTLP.
- Migram/normalizam convencoes semanticas.
- Convertem para registros internos.
- Chamam persistencia em `Models.Telemetry.Telemetry`.

## Fluxo Kafka/PubSub

`src/Pkg/Queue.hs` implementa consumidores:

- `pubsubService`: puxa mensagens Google PubSub, chama uma funcao de processamento e da ack.
- `kafkaService`: consome topicos Kafka, chama `OtlpServer.processList` ou replay processor.
- `publishJSONToKafka`: produtor Kafka reutilizado globalmente.

O `static/public/otelcol.yaml` recebe OTLP, aplica processors e exporta para Kafka com compressao zstd e particionamento por trace/resource attributes.

## Onde salva logs/traces/metrics

Storage quente padrao:

- Logs e traces: tabela `otel_logs_and_spans`.
- Metrics: tabela `telemetry.metrics`.
- Metadata de metrics: `telemetry.metrics_meta`.

As migrations criam hypertables TimescaleDB por `timestamp`, retention e indices por trace id, span id, parent id, service name e name.

`bulkInsertMetrics` faz insert em `telemetry.metrics` e upsert em `telemetry.metrics_meta`.

`insertAndHandOff` faz:

1. Persistencia dos registros via `bulkInsertOtelLogsAndSpansTF`.
2. Hand-off para extraction worker por projeto.

## TimeFusion

`bulkInsertOtelLogsAndSpansTF` grava sempre no Postgres/TimescaleDB. Se `enableTimefusionWrites` estiver ativo, ele tambem grava em TimeFusion em paralelo via pool Hasql rotulado `"timefusion"`.

Leituras de charts/log explorer usam `enableTimefusionReads` ou `dbSource` por widget/query para escolher Postgres ou TimeFusion.

## Otimizacoes de ingestao

- Batch insert multi-row com limite de parametros do PostgreSQL.
- Chunking de logs/spans em torno de 700 linhas por statement.
- Chunking de metrics em torno de 2700 linhas por insert.
- Hypertables TimescaleDB por hora.
- Indices nos campos mais consultados.
- Retention policy.
- Cache de projeto/API key.
- Free-tier guard antes de gerar spans.
- Kafka producer global reutilizado.
- Collector com batch, memory_limiter, schema processor e transform tier-1.
- Extraction worker assicrono apos persistencia, com safety-net para rows `processed_at IS NULL`.

## Fontes no codigo

- `src/System/Server.hs`
- `src/Opentelemetry/OtlpServer.hs`
- `src/ProcessMessage.hs`
- `src/Models/Telemetry/Telemetry.hs`
- `src/Pkg/Queue.hs`
- `static/migrations/0002_logs_traces_metrics.sql`
- `static/migrations/0052_compression_and_retention_policies.sql`
- `static/public/otelcol.yaml`
- `static/public/internal-otelcol.yml`
