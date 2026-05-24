# Análise de leitura — como a API HyperDX lê o ClickHouse

## Escopo
Este documento foca na **camada de leitura** (query path) da API HyperDX para ClickHouse:
- como conexões são resolvidas por tenant/time
- como queries são montadas (query builder)
- quais bibliotecas são usadas
- como a execução é feita
- práticas operacionais e de segurança observadas

## Referências (paths)
- [otel/hyperdx/packages/api/src/routers/api/clickhouseProxy.ts](../otel/hyperdx/packages/api/src/routers/api/clickhouseProxy.ts)
- [otel/hyperdx/packages/api/src/routers/external-api/v2/charts.ts](../otel/hyperdx/packages/api/src/routers/external-api/v2/charts.ts)
- [otel/hyperdx/packages/api/src/tasks/checkAlerts/index.ts](../otel/hyperdx/packages/api/src/tasks/checkAlerts/index.ts)
- [otel/hyperdx/packages/api/src/tasks/checkAlerts/providers/default.ts](../otel/hyperdx/packages/api/src/tasks/checkAlerts/providers/default.ts)
- [otel/hyperdx/packages/api/src/tasks/usageStats.ts](../otel/hyperdx/packages/api/src/tasks/usageStats.ts)
- [otel/hyperdx/packages/api/src/models/connection.ts](../otel/hyperdx/packages/api/src/models/connection.ts)
- [otel/hyperdx/packages/api/src/controllers/connection.ts](../otel/hyperdx/packages/api/src/controllers/connection.ts)
- [otel/hyperdx/packages/api/src/models/source.ts](../otel/hyperdx/packages/api/src/models/source.ts)
- [otel/hyperdx/packages/api/src/utils/zod.ts](../otel/hyperdx/packages/api/src/utils/zod.ts)
- [otel/hyperdx/packages/common-utils/src/clickhouse/index.ts](../otel/hyperdx/packages/common-utils/src/clickhouse/index.ts)
- [otel/hyperdx/packages/common-utils/src/clickhouse/node.ts](../otel/hyperdx/packages/common-utils/src/clickhouse/node.ts)
- [otel/hyperdx/packages/common-utils/src/core/renderChartConfig.ts](../otel/hyperdx/packages/common-utils/src/core/renderChartConfig.ts)
- [otel/hyperdx/packages/common-utils/src/core/metadata.ts](../otel/hyperdx/packages/common-utils/src/core/metadata.ts)
- [otel/hyperdx/packages/common-utils/src/queryParser.ts](../otel/hyperdx/packages/common-utils/src/queryParser.ts)
- [otel/hyperdx/packages/common-utils/src/core/utils.ts](../otel/hyperdx/packages/common-utils/src/core/utils.ts)
- [otel/hyperdx/packages/common-utils/src/macros.ts](../otel/hyperdx/packages/common-utils/src/macros.ts)
- [otel/hyperdx/packages/common-utils/src/rawSqlParams.ts](../otel/hyperdx/packages/common-utils/src/rawSqlParams.ts)
- [otel/hyperdx/packages/common-utils/package.json](../otel/hyperdx/packages/common-utils/package.json)
- [otel/hyperdx/packages/api/package.json](../otel/hyperdx/packages/api/package.json)

---

## 1) Arquitetura de leitura (visão de alto nível)

A API HyperDX usa **dois caminhos principais de leitura**:

1. **Query Builder interno (tipado/estruturado)**
   - Fluxo típico: endpoint → `ChartConfig` → `renderChartConfig()` → SQL parametrizado (`ChSql`) → `ClickhouseClient.query()`
   - Usado em endpoints e jobs que trabalham com séries/charts/alertas.

2. **Proxy HTTP para ClickHouse (pass-through controlado)**
   - Endpoint `clickhouseProxy` encaminha requests GET/POST para o host da conexão do time.
   - Útil para consultas ad hoc/raw SQL vindas de clientes autorizados.

---

## 2) Onde a API realmente lê o ClickHouse

## A) External API de séries/charts
- Em `external-api/v2/charts.ts`, para cada série:
  - busca `source` e `connection` por `teamId`
  - instancia `new ClickhouseClient({ host, username, password })`
  - cria metadata com `getMetadata(clickhouseClient)`
  - executa `clickhouseClient.queryChartConfig({ config, metadata, querySettings })`

## B) Alerting (job backend)
- Em `tasks/checkAlerts/index.ts`:
  - provider cria `ClickhouseClient` com `application: hyperdx-alerts <version>` e `requestTimeout` explícito
  - alerta monta config (`renderChartConfig`) e executa `queryChartConfig`
  - pode otimizar query com Materialized Views (`tryOptimizeConfigWithMaterializedView`)

## C) Métricas de uso internas
- Em `tasks/usageStats.ts`, usa query direta em `system.parts` com parâmetros (`{dbName: String}`, `{tableN: String}`) para estatísticas de footprint.

## D) Proxy para ClickHouse
- Em `routers/api/clickhouseProxy.ts`:
  - resolve conexão por `x-hyperdx-connection-id` + `teamId`
  - encaminha para host da conexão
  - injeta headers `X-ClickHouse-User` / `X-ClickHouse-Key` e `user-agent` da versão HyperDX

---

## 3) Query Builder: como ele monta SQL

## Peças principais
1. **DSL de SQL parametrizado (`chSql`)**
   - Em `common-utils/src/clickhouse/index.ts`
   - Permite placeholders tipados (`{param:String}`, `{param:Int64}`, `{param:Identifier}`)
   - Retorna `{ sql, params }`

2. **Renderizador de configuração (`renderChartConfig`)**
   - Em `common-utils/src/core/renderChartConfig.ts`
   - Converte `ChartConfig` (builder) em SQL final com partes:
     - `WITH`, `SELECT`, `FROM`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`, `SETTINGS`
   - Para raw SQL, passa por `renderRawSqlChartConfig` + macros

3. **Parser/serializer de filtros (`SearchQueryBuilder`)**
   - Em `common-utils/src/queryParser.ts`
   - Parse de Lucene (`@hyperdx/lucene`) para SQL
   - Serializer conhece tipo de coluna (metadata) e otimiza expressão por tipo

4. **Macros de raw SQL**
   - Em `common-utils/src/macros.ts` e `rawSqlParams.ts`
   - Expande macros como:
     - `$__timeFilter(col)`
     - `$__fromTime`, `$__toTime`
     - `$__interval_s`
   - Injeta parâmetros de intervalo/tempo por display type

## Sobre `SETTINGS`
- `renderChartConfig` sempre coloca `SETTINGS` no final da query (intencional).
- `querySettings` da source são concatenadas via `joinQuerySettings()` (`core/utils.ts`).

---

## 4) Bibliotecas usadas (query/CH)

## Cliente e protocolo
- `@clickhouse/client`
- `@clickhouse/client-common`
- `@clickhouse/client-web` (lado browser em utilitário compartilhado)

## Parsing/serialização SQL e busca
- `node-sql-parser` (parse/sqlify/extração de referências/aliases)
- `sqlstring` (escape/format em várias expressões)
- `@hyperdx/lucene` (parse Lucene para AST)
- `object-hash` (hash para junção de séries em memória)

(Dependências em `packages/common-utils/package.json`.)

---

## 5) Conexão e execução: práticas implementadas

## Multi-tenant
- Conexões são modeladas por `team` (`models/connection.ts`)
- Leitura por conexão sempre passa por `getConnectionById(team, connectionId, ...)`
- A senha é `select: false` por padrão e só é buscada quando necessário (`+password`)

## Cliente de leitura
- `ClickhouseClient` encapsula `createClient(...)` em `node.ts`
- `request_timeout` configurável
- `application` configurável (ex.: alertas)

## Settings de execução (boas práticas)
No `BaseClickhouseClient.processClickhouseSettings()`:
- defaults seguros/úteis:
  - `allow_experimental_analyzer = 1`
  - `date_time_output_format = 'iso'`
  - `wait_end_of_query = 0`
  - `cancel_http_readonly_queries_on_client_close = 1`
  - `output_format_json_quote_64bit_integers = 1`
- detecta settings suportados via `system.settings` (`metadata.getSettings`) e ativa otimizações apenas quando disponíveis:
  - `query_plan_optimize_lazy_materialization`
  - `use_skip_indexes_for_top_k`
  - `use_skip_indexes_on_data_read`
  - `use_skip_indexes_for_disjunctions`
  - `enable_full_text_index`

## Resiliência
- Retry interno limitado (2 tentativas) em `query()`
- Tratamento específico para erro READONLY em `max_rows_to_read`

## Observabilidade
- Log de query debug (query parametrizada expandida)
- `query_id` suportado
- user-agent versionado no proxy

---

## 6) Metadata-driven querying (forte diferencial)

A camada `Metadata` (`core/metadata.ts`) consulta e cacheia:
- `system.tables`
- `system.columns` (`DESCRIBE db.table`)
- `system.data_skipping_indices`
- `system.settings`

Com isso, o builder:
- adapta filtros ao tipo de coluna
- aproveita skip indexes/text index quando possível
- escolhe estratégia para map keys (ex.: `groupUniqArrayArray` vs `lowCardinalityKeys`)
- evita chamadas duplicadas com cache/pendingQueries

---

## 7) Segurança e governança de query

## O que está bom
1. Escopo de conexão por tenant/time.
2. Password não exposto por padrão.
3. Uso de parâmetros em boa parte das queries (`query_params`, `chSql`).
4. Validação de payloads com Zod (ex.: series schema, limites de tamanho e cardinalidade).

## Pontos de atenção
1. `querySettings` (source) são texto livre `setting/value` e viram `SETTINGS` SQL por concatenação.
   - Há filtro de vazio e limite de quantidade (máx. 10), mas não há allowlist explícita por nome de setting.
2. O caminho de proxy permite SQL raw via HTTP para a conexão do usuário autorizado.
   - É poderoso e útil, mas precisa governança operacional (RBAC/quem pode usar, auditoria e limites).
3. `chSql` aceita `UNSAFE_RAW_SQL` em alguns trechos internos (recurso deliberado para expressões avançadas).
   - Exige disciplina de uso em código de servidor.

---

## 8) Padrões de query identificados

1. **Builder-first** para produto (charts/alerts): mais consistente e reaproveitável.
2. **Raw SQL com macros** para casos avançados.
3. **Metadata-first optimization** para adaptar query ao cluster/capacidade real.
4. **Aplicação de settings em duas camadas**:
   - `clickhouse_settings` no client request
   - `SETTINGS ...` no SQL renderizado (source/query config)

---

## 9) Resumo executivo

A leitura da API HyperDX para ClickHouse é uma arquitetura híbrida e madura:
- um **query builder tipado** (com parser Lucene + render SQL + metadata cache)
- um **cliente ClickHouse encapsulado** com defaults de segurança/performance
- e um **proxy raw** para flexibilidade operacional.

O desenho prioriza multi-tenant, observabilidade e performance adaptativa por capacidades do cluster. Os principais riscos estão concentrados no uso avançado (query settings livres e raw SQL via proxy), que pedem governança adicional quando expostos em produção multiusuário.
