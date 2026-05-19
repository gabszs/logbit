# Leitura, consultas e otimizacoes

## Como le dados

O frontend nao le direto do banco, TimeFusion ou S3. A leitura passa pelo backend:

- UI HTMX chama rotas HTML.
- API publica chama rotas `/api/v1`.
- MCP chama `/api/v1/mcp`, que encaminha para rotas internas.
- Dashboards chamam handlers que executam KQL/SQL no backend.
- Replay chama backend, que busca eventos no S3/MinIO e devolve JSON.

## Query engine

O Monoscope possui parser KQL/AQL proprio em `src/Pkg/Parser*`.

Fluxo:

1. Usuario/AI/widget envia query KQL.
2. Backend faz parse para AST.
3. Converte para SQL com filtro de projeto e janela de tempo.
4. Executa via Postgres/TimeFusion pool.
5. Converte resultado para dataset de widget, tabela ou resposta JSON.

`run_sql_query` existe para AI, mas passa por `executeSecuredQuery`, que injeta filtro de projeto.

## Escolha do storage em leitura

`src/Pages/Charts/Charts.hs` escolhe pool assim:

- `dbSource = "postgres"` -> Postgres/Timescale.
- `dbSource = "timefusion"` -> TimeFusion.
- Sem `dbSource`: usa TimeFusion se `ENABLE_TIMEFUSION_READS` estiver ativo; caso contrario usa Postgres/Timescale.

Log explorer tambem passa por helpers `withHasqlTimefusion` condicionados por `enableTimefusionReads`.

## Otimizacoes de banco

- Timescale hypertables por timestamp.
- Retention policy.
- Compression policy em migrations posteriores.
- Indices por project + trace/span/service/name.
- Campos OpenTelemetry muito usados sao materializados como colunas flatten, alem do JSONB.
- `metrics_meta` guarda metadados para listagem rapida de metrics.
- Query cache JSONB existe em migrations.
- Rollups/continuous aggregates para metrics comuns aparecem nas migrations.

## Otimizacoes de ingestao/leitura combinadas

- Collector faz tier-1 parsing barato de logs, preservando `log.original`.
- Backend faz tier-2 derivation/extraction em worker apos persistencia.
- Schema learning/facet catalog materializa resumos para AI e query editor.
- Safety-net jobs reprocessam rows nao derivadas.
- Widgets eager podem carregar dados no primeiro render.
- Agent tool `run_query` retorna `rawData` para reaproveitamento em widgets.

## Onde o S3 entra na leitura

Replay:

- Backend busca `merged.json.gz` e arquivos parciais em S3.
- Combina arrays de eventos.
- Retorna payload JSON ao frontend.

Telemetria:

- O codigo Haskell nao le logs/spans/metrics diretamente de S3.
- Quando TimeFusion esta ativo, a leitura e via PGWire/SQL, nao via API S3.

## Conclusao

Monoscope e backend-centric: navegador e ferramentas externas nunca falam direto com storage. O backend controla autenticacao, projeto, traducao KQL, filtro multi-tenant, escolha do pool e renderizacao.

## Fontes no codigo

- `src/Pages/Charts/Charts.hs`
- `src/Models/Apis/LogQueries.hs`
- `src/Pkg/Parser.hs`
- `src/Pkg/AI.hs`
- `src/Pages/Replay.hs`
- `src/Pages/Dashboards.hs`
- `static/migrations/*`
