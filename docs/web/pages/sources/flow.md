# Sources Page Flow

## Loader e dados iniciais

A rota `/integrations/sources` carrega em paralelo:

- primeira pagina de sources com `getSources(page, PAGE_SIZE)`
- conexoes ClickHouse com `getConnectionsForSourceSelect`

Query keys principais:

- `["sources", "list", page]`
- `["connections", "source-select"]`

O botao refresh invalida ambas.

## Lista

`SourcesPage` renderiza:

- contador de sources
- contador de conexoes ClickHouse
- estado vazio quando nao ha sources
- `SourceRow` para cada source
- paginacao simples por `PAGE_SIZE`

`SourceRow` e type-aware:

- badge usa `source.type`
- detalhes comuns aparecem para log e trace
- detalhes especificos aparecem apenas para o tipo correto

Detalhes comuns:

- IDs de source e connection
- database/table
- default select/order
- timestamp query expression
- displayed timestamp expression
- service name field
- body field
- trace/span ids
- resource attributes
- lucene implicit column

Detalhes especificos de log:

- severity field
- log attributes field
- trace source ID
- metric source ID

Detalhes especificos de trace:

- sample rate field
- span attributes field
- duration field
- duration precision field
- parent span ID field
- span events field
- span kind/name fields
- status code/message fields
- log source ID
- metric source ID

## Add/Edit dialog

O dialog usa um `FormState` proprio, com todos os campos controlados como string.

Motivo:

- Inputs e selects React trabalham melhor com `""` do que `null`.
- O backend aceita varios campos nullable.
- A conversao para `null` acontece apenas ao montar o payload.

O tipo do form e derivado de `SourcesUpsertInput["type"]`, atualmente `log | trace`.

## Defaults por tipo

Ao abrir em create:

- o form inicia como `log`

Ao trocar tipo no create:

- preserva `name`, `connectionId`, `database` e `table`
- aplica defaults especificos do novo tipo

Defaults de log:

- `defaultSelectQuery`: `Timestamp, ServiceName as service, SeverityText as level, Body`
- `bodyField`: `Body`
- `luceneImplicitColumnField`: `Body`
- `severityField`: `SeverityText`
- `logAttributesField`: `LogAttributes`

Defaults de trace:

- `defaultSelectQuery`: `Timestamp, ServiceName as service, StatusCode as level, round(Duration / 1e6) as duration, SpanName`
- `bodyField`: `SpanName`
- `luceneImplicitColumnField`: `SpanName`
- `durationPrecisionField`: `9`
- campos OTEL de trace como `SpanAttributes`, `Duration`, `ParentSpanId`, `Events`, `SpanKind`, `SpanName`, `StatusCode`, `StatusMessage`

Ao abrir em edit:

- o form e preenchido via `formFromSource(source)`
- o tipo nao pode ser alterado
- campos nullable do backend viram `""`

## Payload

`buildPayload` cria um payload discriminado:

```ts
type: "log" | "trace"
```

Campos comuns sao enviados para ambos:

- database/table
- default select/order
- resource attributes
- timestamp query expression
- displayed timestamp expression
- service/body/trace/span/lucene
- query settings, materialized views e highlighted expressions preservados da source em edit
- metric source id

Payload de log adiciona:

- `severityField`
- `logAttributesField`
- `traceSourceId`

Payload de trace adiciona:

- `sampleRateField`
- `spanAttributesField`
- `durationField`
- `durationPrecisionField`
- `parentSpanIdField`
- `spanEventsField`
- `spanKindField`
- `spanNameField`
- `statusCodeField`
- `statusMessageField`
- `logSourceId`

`durationPrecisionField` e validado no cliente como inteiro entre `0` e `9` antes do submit.

## Correlations

As correlacoes sao type-aware:

- source `log` mostra `Trace source`
- source `trace` mostra `Log source`
- `Metric source` aparece desabilitado enquanto metrics nao existem no gerenciamento atual

As opcoes:

- vem de `getSourcesForSourceSelect`
- excluem a propria source em edit
- sao filtradas por tipo para evitar selecionar uma source incompatavel

## Submit

Create:

```txt
POST /v1/sources
```

Edit:

```txt
PATCH /v1/sources/{id}
```

No edit, o payload envia `name`, `connectionId` e `config`. O backend decide o parser da config usando o tipo existente da source.

Em sucesso:

- mostra toast
- chama `onSuccess`
- fecha o dialog

Em erro:

- mostra `formError`
- mostra toast com a mensagem do backend quando disponivel

## Tipos compartilhados

`apps/web/src/lib/sources.ts` deriva os tipos da resposta do servidor:

- `SourceEntity`
- `LogSourceEntity`
- `TraceSourceEntity`

Tambem exporta type guards:

- `isLogSource`
- `isTraceSource`

Isso mantem a pagina de sources pronta para `log | trace` sem quebrar areas que precisam especificamente de logs, como `/logs`.
