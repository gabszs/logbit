# OpenObserve: análise complementar do projeto

Este documento complementa `storage-analysis.md`. Aqui o foco é a arquitetura geral, módulos extras e ideias que valem observar para o Loglog.

## Visão geral

OpenObserve é um observability backend em Rust, empacotado como single binary, mas internamente organizado como uma plataforma completa:

- logs;
- metrics;
- traces;
- RUM/session replay;
- dashboards;
- alertas;
- pipelines de transformação;
- derived streams;
- search jobs;
- file compaction;
- multi-tenancy por organização e stream.

A proposta técnica é substituir um stack tipo Elasticsearch/Splunk/Datadog por:

- Parquet como formato de dados;
- object storage como camada barata e durável;
- DataFusion como motor SQL;
- WAL/memtable local para ingestão rápida;
- metastore/file list para evitar depender de listagem do bucket em query;
- caches e índices opcionais para performance.

## Single binary, vários papéis

Mesmo sendo um binário único, ele pode rodar com papéis diferentes via `ZO_NODE_ROLE`.

Papéis encontrados em `src/config/src/meta/cluster.rs`:

- `all`: single-node, faz tudo.
- `router`: recebe HTTP/gRPC e encaminha para nós apropriados.
- `ingester`: recebe ingestão, grava WAL/memtable, gera Parquet local e sobe para storage.
- `querier`: executa queries.
- `compactor`: compacta arquivos antigos/pequenos e aplica retention.
- `flatten_compactor`: compactor especializado.
- `alert_manager`: avalia alertas/schedules.
- `action_server`: executa ações/scripts.

Também há `RoleGroup`:

- `interactive`: query interativa/UI.
- `background`: reports, alerts, derived streams, search jobs.
- `none`: serve para ambos.

Isso é interessante porque separa carga humana interativa de jobs pesados sem precisar de outro projeto.

## HTTP router e distribuição

Em modo router, `src/router/http/mod.rs` decide o destino:

- rotas de query vão para queriers;
- rotas de ingestão vão para ingesters;
- rotas fixas podem ir para um querier específico;
- estratégia de dispatch pode ser por workload/random/outros caminhos.

Em gRPC, existem routers específicos para logs, metrics e traces em `src/router/grpc/ingest/*`. Eles preservam contexto OpenTelemetry e encaminham para ingester via canal interno gRPC.

Essa camada deixa clientes/collectors falando com um endpoint único, mas o cluster separa internamente escrita e leitura.

## Metastore, coordenação e dependências

O projeto tem duas camadas diferentes que não devem ser confundidas:

- object storage: guarda Parquet e arquivos derivados;
- metastore/coordinator: guarda schemas, file list, jobs, alerts, pipelines, etc.

No código:

- `src/infra/src/db`: KV/metastore base.
- `src/infra/src/file_list`: tabela crítica de arquivos.
- `src/infra/src/coordinator`: coordenação/eventos.
- `src/infra/src/queue`: filas.
- `src/infra/src/scheduler`: agendamento.
- `src/infra/src/schema`: schemas/cache.

Config relevante:

- `ZO_META_STORE`
- `ZO_META_POSTGRES_DSN`
- `ZO_CLUSTER_COORDINATOR`, default `nats`
- `ZO_QUEUE_STORE`, default `nats`

Em local mode, o projeto consegue usar armazenamento local. Em HA/cluster, Postgres/NATS entram como infraestrutura operacional.

## Modelo de dados

A unidade lógica é:

- org;
- stream type: logs, metrics, traces, etc.;
- stream name;
- schema;
- arquivos Parquet por partição temporal e partições adicionais.

O path final segue a ideia:

`files/{org}/{stream_type}/{stream}/{yyyy}/{MM}/{dd}/{HH}/{partition...}/{file}.parquet`

Isso dá:

- isolamento multi-tenant simples;
- filtro por tempo no path;
- pruning por partição antes de abrir Parquet;
- possibilidade de mover/compactar arquivos sem reescrever metadados globais complexos.

## Pipeline de ingestão além do storage

A ingestão não é só "recebe JSON e grava".

Ela inclui:

- validação de org/stream/quota;
- normalização de timestamp;
- flatten/refactor de campos;
- schema inference/update;
- pipeline de transformação;
- VRL functions;
- geração de `_id`;
- armazenamento de `_original_data` quando configurado;
- alertas realtime;
- logs-to-metrics/derived behavior.

O serviço de pipelines fica em `src/service/pipeline`.

Ponto importante: pipelines só aceitam funções VRL. O código bloqueia JavaScript em pipeline, mesmo que funções JS existam para outros usos. Isso reduz risco e torna execução de ingestão mais previsível.

## VRL e funções

O projeto usa `vrl` e `vector-enrichment`, o ecossistema do Vector, para transformação de eventos.

VRL aparece em dois lugares:

- ingestão/pipelines: transformar, enriquecer, redigir;
- query response: aplicar transformação no resultado em alguns casos.

Esse design é forte porque uma linguagem declarativa/sandboxada resolve boa parte do "user-defined processing" sem entregar execução arbitrária ampla.

## Alertas, scheduler e derived streams

Alertas são integrados ao metastore e scheduler.

Peças relevantes:

- `src/service/alerts`
- `src/service/alerts/scheduler`
- `src/service/db/alerts`
- `src/infra/src/scheduler`

Alertas podem ser:

- realtime, ligados à ingestão;
- scheduled, avaliados por jobs.

Derived streams também entram como triggers/schedules. Uma pipeline scheduled salva detalhes de derived stream no fluxo de alerts/scheduler. Isso mostra uma decisão arquitetural: "alert", "report", "derived stream" e "search job" compartilham infraestrutura de scheduling/background work.

## Query engine

Query é centrada em DataFusion:

- SQL parser/rewriter próprio em `src/service/search/sql`;
- planejamento e otimização em `src/service/search/datafusion`;
- custom UDF/UDAF para funções do produto;
- query distribuída via gRPC/Flight;
- suporte a PromQL em `src/service/promql`.

DataFusion context registra:

- stores virtuais `memory:///` e `wal:///`;
- Parquet listing tables;
- file statistics cache;
- memory pool configurável;
- UDFs como `str_match`, `fuzzy_match`, regexp, histogram, array helpers, transforms.

O backend monta uma visão lógica onde storage remoto, cache, WAL local e memtable entram como tabelas consultáveis.

## Caches

Existem vários níveis:

- cache de file list local;
- cache de schema;
- cache de dados em disco;
- cache de dados em memória;
- cache de resultados de query;
- cache de estatísticas de arquivos DataFusion;
- cache de índices Tantivy/resultados de índice;
- cache opcional de "latest files".

Config relevante:

- `ZO_MEMORY_CACHE_ENABLED`
- `ZO_DISK_CACHE_ENABLED`
- `ZO_RESULT_CACHE_ENABLED`
- `ZO_DATAFUSION_FILE_STAT_CACHE_MAX_ENTRIES`
- `ZO_CACHE_LATEST_FILES_ENABLED`
- `ZO_CACHE_LATEST_FILES_PARQUET`
- `ZO_CACHE_LATEST_FILES_INDEX`

O desenho evita uma dependência única de cache. Ele usa cache como acelerador, não como fonte primária de verdade.

## Índices

O storage principal continua sendo Parquet. Índices são auxiliares.

O projeto usa Tantivy para índice invertido opcional:

- full-text search;
- secondary index fields;
- arquivos de índice associados ao Parquet;
- otimizações no plano DataFusion para usar índice quando vale a pena.

Config relevante:

- `ZO_INVERTED_INDEX_ENABLED`
- campos FTS/index configurados por stream;
- threshold para pular índice quando ele retorna linhas demais.

Ideia importante: índice é seletivo e opcional. Quando o filtro é pouco seletivo, DataFusion/Parquet pode ser melhor que índice.

## Compaction e lifecycle

Compaction não é detalhe operacional, é parte central do design.

Existem dois momentos:

1. Ingester merge antes do upload final: junta arquivos locais pequenos.
2. Compactor de longo prazo: reorganiza arquivos no object storage, aplica retention e remove antigos.

Arquivos relevantes:

- `src/job/files/parquet.rs`
- `src/service/compact/*`

Esse modelo é parecido com LSM/log-structured systems:

- escrita rápida e append-only;
- pequenos arquivos entram;
- jobs assíncronos deixam storage otimizado;
- queries usam file list para enxergar a versão atual.

## Frontend

O frontend fica em `web/` e é Vue, não React.

O serviço de search em `web/src/services/search.ts` chama o backend via API HTTP:

- `_search`
- `_search_partition`
- `_search_multi`
- Prometheus-compatible endpoints;
- search jobs.

Ele não acessa S3, WAL ou Parquet diretamente. Isso confirma o modelo backend-mediated.

## Enterprise/cloud hooks

O repositório tem vários `#[cfg(feature = "enterprise")]` e `#[cfg(feature = "cloud")]`.

Algumas capacidades aparecem como hooks:

- super cluster/multi-region;
- federated search;
- service streams;
- anomaly detection;
- domain management;
- license/cloud billing;
- advanced RBAC;
- work groups.

Mesmo quando a implementação enterprise não está inteira no tree aberto, o core já foi desenhado com extensões no caminho crítico.

## Segurança e isolamento

Pontos notáveis:

- multi-tenancy por org em quase todas as chaves;
- token interno gRPC para comunicação entre nós;
- permissões/RBAC em rotas enterprise;
- bloqueio de orgs com quota excedida;
- proteção contra SSRF configurável;
- JavaScript proibido em pipelines de ingestão;
- dados imutáveis por design: não edita eventos individuais, apenas retention/delete por faixas/streams.

O ponto "imutável" é importante: simplifica storage e compliance, mas muda a forma de pensar deleção/correção.

## Observabilidade interna

O projeto mede bastante coisa:

- tempo HTTP/gRPC;
- bytes escritos/lidos;
- WAL bytes;
- memtable bytes;
- lock time de WAL/memtable;
- cache hit/ratio;
- query scan stats;
- search inspector/profile;
- self-reporting de usage.

Isso é útil porque o produto é observability e ele próprio precisa explicar custo/performance das queries.

## Coisas que valem copiar ou adaptar para o Loglog

1. Separar ingestão rápida de persistência final.

WAL/memtable local primeiro, upload/merge assíncrono depois. Isso reduz latência do collector e isola falhas do object storage.

2. Ter um file list/metastore explícito.

Não depender de listar bucket para buscar dados por tempo/stream. Um índice de arquivos com min/max timestamp, size e records é simples e poderoso.

3. Pensar em dados recentes como uma camada própria.

Query precisa juntar:

- memtable;
- arquivos locais ainda não enviados;
- storage final.

Isso evita "dados sumirem por alguns segundos" depois da ingestão.

4. Usar Parquet como verdade de longo prazo.

Parquet + Arrow + DataFusion é uma base forte para observability analítico.

5. Fazer compaction assíncrona desde cedo.

Sem compaction, object storage vira um cemitério de arquivos pequenos e query degrada rápido.

6. Criar funções/pipelines sandboxados.

VRL é uma boa referência. Evita virar uma plataforma de execução arbitrária no hot path de ingestão.

7. Expor métricas do pipeline de storage.

WAL backlog, parquet pending upload, file list lag, compaction lag, cache ratios e scan bytes são sinais essenciais.

8. Tratar query como pipeline planejado.

Parse SQL -> resolve streams -> busca file list -> cria plano -> executa -> mede scan stats. Essa separação deixa otimização possível.

9. Role separation sem separar codebase.

Um binário com papéis configuráveis é operacionalmente simples e escala bem.

## Riscos/complexidades do desenho

- Muitas camadas de cache podem dificultar debugging.
- Query precisa coordenar dados em memtable, WAL local e object storage.
- File list vira componente crítico.
- Compactor precisa ser correto para não apagar arquivo em uso.
- Object storage eventual consistency e falhas parciais precisam de cuidado.
- UDS/schema evolution em logs é difícil, especialmente com muitos campos.
- Multi-region/super cluster aumenta bastante a complexidade de consistência.

## Mapa rápido de diretórios

- `src/handler/http`: APIs HTTP.
- `src/handler/grpc`: APIs gRPC reais dos papéis.
- `src/router`: proxy/dispatch router.
- `src/service/logs`, `metrics`, `traces`: ingestão e lógica por sinal.
- `src/service/ingestion`: fluxo comum de ingestão.
- `src/ingester`: WAL, memtable, immutable, persist local.
- `src/job/files`: upload de Parquet local para storage.
- `src/service/search`: query SQL/DataFusion.
- `src/service/promql`: PromQL.
- `src/service/compact`: compaction/retention.
- `src/infra/src/storage`: object storage.
- `src/infra/src/file_list`: metastore de arquivos.
- `src/service/pipeline`: pipelines.
- `src/service/alerts`: alertas.
- `web`: frontend Vue.

## Frase de arquitetura

OpenObserve é menos "um banco de logs" e mais um data lake observability: ingestão append-only, Parquet em object storage, metastore de arquivos, DataFusion para query, jobs assíncronos para manter o lake consultável, e uma camada de produto em cima para alertas, dashboards e pipelines.
