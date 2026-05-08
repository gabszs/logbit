# Sources Schemas

## Visao geral

Os schemas de sources usam uma uniao discriminada por `type`.

Tipos publicos aceitos:

- `log`
- `trace`

Tipo existente no enum do banco, mas fora da API publica:

- `metric`

O discriminador sempre seleciona o schema de `config` correspondente. Isso evita misturar campos de logs em traces e vice-versa.

## BaseSourceConfigSchema

`BaseSourceConfigSchema` vive em `apps/server/src/features/sources/base/schemas.ts` e concentra campos comuns:

- localizacao: `database`, `table`
- query padrao: `defaultOrderByQuery`
- timestamp: `timestampQueryField`, `displayedTimestampField`
- identidade OTEL: `serviceNameField`, `traceIdField`, `spanIdField`
- busca: `luceneImplicitColumnField`
- correlacao futura: `metricSourceId`
- materializacoes e destaque: `materializedViews`, `highlightedRowAttributeExpressions`, `highlightedTraceAttributeExpressions`
- ClickHouse settings por query: `querySettings`

Defaults importantes:

- `database`: `null`
- `table`: `null`
- `defaultOrderByQuery`: `Timestamp DESC`
- `timestampQueryField`: `Timestamp`
- `displayedTimestampField`: `Timestamp`
- `serviceNameField`: `ServiceName`
- `traceIdField`: `TraceId`
- `spanIdField`: `SpanId`
- `luceneImplicitColumnField`: `Body`
- arrays de configuracao: `[]`

## Log Source Config

`logsConfigSchema` estende o base em `apps/server/src/features/sources/logs/schemas.ts`.

Campos especificos:

- `defaultSelectQuery`: default `Timestamp, ServiceName as service, SeverityText as level, Body`
- `severityField`: default `SeverityText`
- `logAttributesField`: default `LogAttributes`
- `bodyField`: default `Body`
- `traceSourceId`: UUIDv7 nullable para correlacionar log -> trace

Schemas exportados:

- `logsConfigSchema`: config completa, usada em create/upsert e em resposta.
- `upsertLogsConfigSchema`: wrapper OpenAPI para create.
- `patchLogsConfigSchema`: config parcial e `strict`, usada em PATCH.

`patchLogsConfigSchema` ser `strict` e importante porque o update usa uma uniao entre patch de log e patch de trace. Campos desconhecidos nao devem ser aceitos silenciosamente pelo branch errado.

## Trace Source Config

`tracesConfigSchema` estende o base em `apps/server/src/features/sources/traces/schemas.ts`.

Campos especificos:

- `defaultSelectQuery`: default `Timestamp, ServiceName as service, StatusCode as level, round(Duration / 1e6) as duration, SpanName`
- `sampleRateField`: default `null`
- `spanAttributesField`: default `SpanAttributes`
- `durationField`: default `Duration`
- `durationPrecisionField`: numero entre `0` e `9`, default `9`
- `parentSpanIdField`: default `ParentSpanId`
- `spanEventsField`: default `Events`
- `spanKindField`: default `SpanKind`
- `spanNameField`: default `SpanName`
- `statusCodeField`: default `StatusCode`
- `statusMessageField`: default `StatusMessage`
- `bodyField`: default `SpanName`
- `luceneImplicitColumnField`: default `SpanName`
- `logSourceId`: UUIDv7 nullable para correlacionar trace -> log

Schemas exportados:

- `tracesConfigSchema`: config completa, usada em create/upsert e em resposta.
- `upsertTracesConfigSchema`: wrapper OpenAPI para create.
- `patchTracesConfigSchema`: config parcial e `strict`, usada em PATCH.

## Sources API Schemas

`apps/server/src/features/sources/schemas.ts` monta a superficie publica:

- `sourcesSchema`: resposta individual, uniao discriminada `log | trace`.
- `sourcesUpsertSchema`: create, uniao discriminada `log | trace`.
- `sourceUpdateSchema`: PATCH parcial de campos comuns e `config`.
- `sourcesSuccessSchema`: envelope `{ message, data, metadata }`.
- `sourcesListSuccessSchema`: envelope de lista com `data: Source[]`.

Campos comuns da source:

- `id`: UUIDv7
- `name`: string 1..255
- `type`: `log | trace`
- `organizationId`: UUIDv7
- `connectionId`: UUIDv7
- `createdAt`, `updatedAt`
- `config`: schema dependente do `type`

## PATCH

`sourceUpdateSchema` aceita campos comuns parciais e `config` parcial.

Regra importante:

- O request de PATCH nao precisa enviar `type`.
- O service busca a source existente e escolhe o parser pelo `existingSource.type`.
- A config final e `existingSource.config + patch.config`, validada de novo pelo schema completo do tipo.

Isso permite editar uma source sem reenviar todos os campos e preserva defaults/configuracoes avancadas existentes.
