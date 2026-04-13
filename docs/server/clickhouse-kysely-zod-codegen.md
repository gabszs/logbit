# ClickHouse Types e Zod via `kysely-zod-codegen`

Este documento resume como gerar tipos TypeScript e schemas Zod a partir do ClickHouse do projeto, usando o fork local em `otel/kysely-zod-codegen`.

## Contexto

O `compose.yaml` sobe um serviço `clickhouse` com:

- host HTTP: `localhost:8123`
- usuário: `default`
- senha: `clickhouse`
- database: `default`

Referência: [compose.yaml](/home/gabriel-carvalho/Documents/loglog/compose.yaml:22)

O código do servidor também usa Kysely com `@founderpath/kysely-clickhouse` em [index.ts](/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/index.ts:1).

## O que foi usado

O fork local fica em:

- `otel/kysely-zod-codegen`

Esse fork já tem suporte a `clickhouse`, mas o dialeto precisa ser informado explicitamente com `--dialect=clickhouse`.

## Uso básico do CLI

Ir para a pasta do codegen:

```bash
cd /home/gabriel-carvalho/Documents/loglog/otel/kysely-zod-codegen
```

Gerar o arquivo:

```bash
bun run src/cli/bin.ts \
  --dialect=clickhouse \
  --url="http://default:clickhouse@localhost:8123/default" \
  --schema=default \
  --include-pattern="otel_*" \
  --out-file="/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/clickhouse/generated.ts" \
  --log-level=info
```

Visualizar no terminal sem gravar arquivo:

```bash
bun run src/cli/bin.ts \
  --dialect=clickhouse \
  --url="http://default:clickhouse@localhost:8123/default" \
  --schema=default \
  --include-pattern="otel_*" \
  --print
```

## Explicação rápida dos argumentos

- `--dialect=clickhouse`: obrigatório para esse caso
- `--url=...`: URL HTTP do ClickHouse com usuário, senha e database
- `--schema=default`: schema/database padrão do ClickHouse
- `--include-pattern="otel_*"`: limita a geração às tabelas OTel
- `--out-file=...`: caminho do arquivo gerado
- `--log-level=info`: mostra conexão e quantidade de tabelas introspectadas
- `--print`: imprime no terminal em vez de salvar

## Tabelas encontradas

Na geração feita durante esta análise, o CLI introspectou estas tabelas:

- `otel_logs`
- `otel_metrics_exponential_histogram`
- `otel_metrics_gauge`
- `otel_metrics_histogram`
- `otel_metrics_sum`
- `otel_metrics_summary`
- `otel_traces`
- `otel_traces_trace_id_ts`
- `otel_traces_trace_id_ts_mv`

## Arquivo gerado

O arquivo foi gerado em:

- [generated.ts](/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/clickhouse/generated.ts:1)

Esse arquivo contém:

- interfaces TS para as tabelas
- schema Zod para cada tabela
- `DB` com o mapeamento completo

## Problema observado no gerado cru

O output gerado pelo CLI funcionou, mas achatou vários tipos complexos do ClickHouse.

Exemplos:

- `Array(...)` virou `string`
- `Map(LowCardinality(String), String)` virou `string`
- `Bool` virou `number`
- `DateTime64(9)` virou `string`
- `Array(JSON)` virou `string`

Isso era especialmente visível nas tabelas:

- `otel_metrics_*`
- `otel_traces`

## Refinamentos manuais aplicados em `generated.ts`

Depois da geração, o arquivo foi refinado manualmente para refletir melhor o schema real.

### Tipos TS adicionados

Foram adicionados aliases auxiliares no topo do arquivo:

- `DateTime64`
- `StringArray`
- `NumberArray`
- `DateTime64Array`
- `StringMap`
- `StringMapArray`

### Mapeamentos melhorados

Os seguintes ajustes foram feitos:

- `Array(LowCardinality(String))` -> `StringArray`
- `Array(UInt64)` e `Array(Float64)` -> `NumberArray`
- `Map(LowCardinality(String), String)` -> `StringMap`
- `Array(Map(...))` -> `StringMapArray`
- `Bool` -> `boolean`
- `DateTime64(9)` -> `DateTime64`
- `Array(DateTime64(9))` -> `DateTime64Array`
- `Array(JSON)` -> `JsonArray`

### Exemplos de campos corrigidos

- `otel_logs.ResourceAttributesKeys`
- `otel_logs.ScopeAttributesKeys`
- `otel_logs.LogAttributesKeys`
- `otel_metrics_exponential_histogram.PositiveBucketCounts`
- `otel_metrics_histogram.BucketCounts`
- `otel_metrics_summary.ValueAtQuantiles.*`
- `otel_metrics_sum.IsMonotonic`
- `otel_traces.Events.*`
- `otel_traces.Links.*`

## Refinamento do Zod

Além dos tipos TS, o schema Zod também foi refinado.

### Novos helpers de Zod

Foram adicionados:

- `JsonValueSchema`
- `JsonSchema`
- `DateTime64Schema`
- `DateTime64ArraySchema`

### O que mudou no Zod

- `JSON` deixou de ser `z.unknown()` e passou a validar JSON recursivo
- `DateTime64` passou a usar `z.coerce.date()`
- arrays passaram a usar `z.array(...)`
- maps passaram a usar `z.record(z.string(), z.string())`
- campos como `Events.Attributes` e `Links.Attributes` passaram a validar arrays de JSON

## Exemplos no arquivo final

Trechos úteis para inspeção:

- [aliases e helpers](/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/clickhouse/generated.ts:27)
- [OtelLogs](/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/clickhouse/generated.ts:65)
- [OtelMetricsExponentialHistogram](/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/clickhouse/generated.ts:108)
- [OtelMetricsSummary](/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/clickhouse/generated.ts:336)
- [OtelTraces](/home/gabriel-carvalho/Documents/loglog/apps/server/src/db/clickhouse/generated.ts:375)

## Limitação importante

Os refinamentos foram aplicados manualmente em `generated.ts`.

Se o comando do CLI for executado novamente, o arquivo será sobrescrito e volta para o output cru do gerador.

## Próximo passo recomendado

Para tornar isso permanente, o ideal é levar esses refinamentos para o próprio fork em `otel/kysely-zod-codegen`, para que futuras gerações já saiam com:

- arrays corretos
- maps corretos
- `Bool` como boolean
- `DateTime64` com tratamento consistente
- Zod mais fiel para JSON e datas
