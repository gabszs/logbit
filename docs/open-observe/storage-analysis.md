# OpenObserve: análise de storage, ingestão e leitura

Fonte analisada: `/home/gabriel-carvalho/Documents/loglog/otel/openobserve`.

Observação inicial: o arquivo apontado (`package-lock.json`) quase não contém informação útil. Ele só declara o nome `openobserve`, lockfile v3 e nenhum pacote. O projeto real é Rust, com workspace Cargo e módulos em `src/`.

## Resumo executivo

O OpenObserve não grava direto do collector no storage final. O fluxo normal é:

1. Collector/cliente envia OTLP/HTTP/gRPC para o OpenObserve.
2. Um nó `router` pode receber a requisição e encaminhar para um nó `ingester`.
3. O `ingester` valida, transforma e grava primeiro em WAL local e memtable.
4. A memtable é rotacionada para Parquet local dentro de `ZO_DATA_WAL_DIR/files/...`.
5. Um job assíncrono do ingester lê esses Parquets locais, mescla arquivos pequenos, sobe para o object storage final e registra metadados no `file_list`.
6. Queries passam pelo backend. O cliente web não lê storage diretamente.
7. O backend lê:
   - dados recentes ainda não enviados: memtable, immutable memtable e Parquet local do WAL;
   - dados persistidos: object storage, usando lista de arquivos do metastore/file list;
   - caches e índices quando disponíveis.

Então, arquitetura mental curta: collector -> router/backend -> ingester local durable buffer -> object storage + file list -> querier/DataFusion.

## Ingestão: de onde vem e quem salva

Entradas principais:

- OTLP logs/metrics/traces via HTTP: rotas como `/api/{org_id}/v1/logs`, `/api/{org_id}/v1/metrics`, traces em handlers HTTP.
- OTLP gRPC: serviços `LogsService`, `MetricsService`, `TraceService`.
- Formatos compatíveis extras: bulk, HEC, Loki, GCP, Kinesis, RUM etc.

O projeto separa bem router de ingester:

- `src/router/grpc/ingest/logs.rs`, `metrics.rs`, `traces.rs`: recebe gRPC no papel de router e encaminha para um ingester via `get_ingester_channel()`.
- `src/router/http/mod.rs`: em modo router, decide se uma rota vai para querier ou ingester. Ingestão vai para ingester.
- `src/handler/grpc/request/logs.rs`, `metrics/ingester.rs`, `traces.rs`: executam a ingestão no nó ingester.
- `src/service/ingestion/ingestion_service.rs`: cliente interno gRPC para mandar dados a um ingester.

Conclusão direta para sua pergunta: o collector não grava storage; ele só manda para OpenObserve. Quem salva é o backend, mais especificamente o nó ingester. Em cluster, pode haver um router no meio; em single-node, o mesmo processo pode ter todos os papéis.

## Caminho de escrita

O ponto comum de escrita é `src/service/ingestion/mod.rs::write_file`.

Ele recebe batches por stream e cria `ingester::Entry`. Depois chama:

- `ingester::get_writer(...)`
- `writer.write_batch(entries, fsync)`

O `Writer` fica em `src/ingester/src/writer.rs`.

O que ele faz:

- escolhe bucket de memtable por hash de `thread_id`, org e stream;
- serializa entries para bytes;
- converte JSON para Arrow `RecordBatch`;
- grava bytes no WAL;
- grava batches Arrow na memtable;
- rotaciona por tamanho/tempo;
- opcionalmente usa fila assíncrona de WAL (`ZO_WAL_WRITE_QUEUE_ENABLED`);
- opcionalmente usa runtime dedicado para WAL (`ZO_WAL_DEDICATED_RUNTIME_ENABLED`).

Estrutura local:

- WAL: `ZO_DATA_WAL_DIR/logs/{bucket}/{org}/{stream_type}/{id}.wal`
- Parquet temporário/local: `ZO_DATA_WAL_DIR/files/{org}/{stream_type}/{stream}/{bucket}/{yyyy}/{MM}/{dd}/{HH}/.../*.parquet`

Default de diretórios:

- `ZO_DATA_DIR`: `./data/openobserve/`
- `ZO_DATA_WAL_DIR`: se vazio, vira `./data/openobserve/wal/`
- `ZO_DATA_CACHE_DIR`: se vazio, vira `./data/openobserve/cache/`

## WAL, memtable e Parquet local

O WAL é o primeiro ponto durável local. A memtable é a versão em memória usada para query recente.

No `Writer`:

- `preprocess_batch()` move CPU para antes do loop de IO: serializa entries e gera `RecordBatch`.
- `consume_processed()` grava no WAL e na memtable.
- `rotate()` troca WAL/memtable quando passa limites de tamanho ou tempo.
- a memtable antiga vira `Immutable`.

Depois, `src/ingester/src/immutable.rs` persiste a immutable memtable:

1. dump da memtable para Parquet local;
2. cria lock file;
3. remove WAL correspondente;
4. renomeia `.par` para `.parquet`;
5. remove lock.

O Parquet é gerado em `src/ingester/src/partition.rs` usando `new_parquet_writer`.

## Upload para storage final

O upload não acontece dentro da requisição de ingestão.

O job em `src/job/files/parquet.rs` roda apenas em nó ingester:

- escaneia `ZO_DATA_WAL_DIR/files/` procurando `.parquet`;
- agrupa por prefixo/partição;
- lê metadados do cache `WAL_PARQUET_METADATA` ou do próprio Parquet;
- espera juntar tamanho suficiente ou expirar tempo máximo;
- mescla arquivos pequenos com DataFusion;
- gera nome final com `src/job/files/mod.rs::generate_storage_file_name`;
- sobe para storage com `infra::storage::put`;
- registra no `file_list` com `db::file_list::set`;
- remove o arquivo local quando não está sendo usado por query.

Formato do nome final:

`files/{org}/{stream_type}/{stream_name}/{yyyy}/{MM}/{dd}/{HH}/{partition...}/{id}.parquet`

Object storage fica abstraído em `src/infra/src/storage/`.

Suportes principais:

- local disk em modo local;
- S3/AWS;
- Azure Blob;
- Google Cloud Storage;
- múltiplas contas/storage providers por org/stream;
- prefixo de bucket (`ZO_S3_BUCKET_PREFIX`);
- multipart upload quando passa `ZO_S3_MULTI_PART_UPLOAD_SIZE`.

## Metadados: file list

O OpenObserve não descobre arquivos remotos fazendo listagem no bucket em toda query. Ele mantém um índice de arquivos chamado `file_list`.

Esse `file_list` guarda, por arquivo:

- account/storage;
- key;
- min/max timestamp;
- número de registros;
- tamanho original/comprimido;
- estado de delete/compactação.

Implementações aparecem em:

- `src/infra/src/file_list/sqlite.rs`
- `src/infra/src/file_list/postgres.rs`

Em local mode, SQLite é comum. Em cluster, o código força/espera metastore PostgreSQL para vários fluxos. Há também cache local de file list.

## Leitura: cliente direto ou backend?

O cliente web lê pelo backend.

No frontend, `web/src/services/search.ts` chama endpoints como:

- `/api/{org}/_search`
- `/api/{org}/_search_partition`
- PromQL: `/api/{org}/prometheus/api/v1/query_range`

No backend, as rotas estão em `src/handler/http/request/search/mod.rs` e `src/handler/http/router/mod.rs`.

O browser não fala com S3, WAL, Parquet ou DataFusion diretamente. Toda query passa pelo serviço OpenObserve.

## Caminho de query

Fluxo geral:

1. HTTP recebe `_search`.
2. Backend parseia SQL e resolve streams/schemas.
3. Consulta `file_list` para achar arquivos por org, stream e range de tempo.
4. Também consulta dados recentes que ainda estão no ingester:
   - memtable;
   - immutable memtable;
   - Parquet local no WAL.
5. Cria tabelas DataFusion para os arquivos.
6. Executa plano SQL/DataFusion.
7. Retorna JSON ao cliente.

Leitura de storage persistido:

- `src/service/search/datafusion/exec.rs` cria `SessionContext`, `ListingTable` e `ParquetFormat`.
- `object_store` é usado por baixo para buscar bytes/ranges do storage.
- DataFusion lê Parquet com projection/predicate pushdown quando configurado.

Leitura de dados recentes:

- `src/service/search/grpc/wal.rs::search_memtable`: lê memtable/immutable direto do ingester.
- `src/service/search/grpc/wal.rs::search_parquet`: lê Parquet local ainda em WAL dir.
- `src/service/search/datafusion/storage/wal.rs`: expõe WAL local como um `ObjectStore` DataFusion.
- `src/service/search/datafusion/storage/memory.rs`: expõe cache/memória como `ObjectStore`.

## Bibliotecas principais

Storage e formato:

- `object_store`: abstração para S3/Azure/GCS/local, range reads, multipart e retries.
- `parquet`: escrita/leitura Parquet async.
- `arrow`, `arrow-schema`, `arrow-json`: representação colunar em memória.
- `datafusion`: motor SQL/query sobre Arrow/Parquet.
- `datafusion-proto`: serialização de planos em execução distribuída.

Ingestão/protocolo:

- `opentelemetry-proto`: structs OTLP logs/metrics/traces.
- `tonic`, `prost`: gRPC/Protobuf.
- `axum`, `hyper`, `tower`: HTTP server/router.

Performance/concorrência:

- `tokio`: runtime async.
- `rayon`: paralelismo CPU em alguns pontos de adaptação/merge.
- `dashmap`, `hashbrown`, `hashlink`, caches customizados.
- `zstd`, `snap`, `flate2`, `brotli`: compressões.

Índice e busca textual:

- `tantivy`: índice invertido opcional.
- `tantivy-fst`: estruturas FST.

Coordenação/metastore:

- `sqlx`, `sea-orm`: DB/metastore.
- NATS aparece como coordinator/queue default em config.

## Otimizações relevantes

Ingestão:

- WAL local antes de storage remoto, reduzindo latência da requisição e protegendo contra falha.
- Memtable em Arrow para query recente sem esperar upload.
- Conversão JSON -> Arrow feita antes do consumer de IO no `Writer`.
- Rotação por tamanho e tempo.
- Buckets de memtable para reduzir contenção.
- Fila de escrita WAL opcional.
- Circuit breakers de memória, disco e tamanho de memtable.
- Reexecução/replay de WAL no startup.

Parquet:

- Compressão padrão `zstd`.
- Timestamp com `DELTA_BINARY_PACKED`.
- Dicionário desligado para `_timestamp`.
- Bloom filters por campos configurados.
- Metadados `min_ts`, `max_ts`, `records`, `original_size` gravados no footer.
- Mescla de arquivos pequenos antes do upload final.
- Upload multipart para arquivos grandes.

Query:

- DataFusion com batch size configurável.
- Predicate pushdown opcional (`ZO_FEATURE_PUSHDOWN_FILTER_ENABLED`).
- Bloom filter em leitura habilitado por padrão, podendo ser desligado para search.
- File statistics cache (`ZO_DATAFUSION_FILE_STAT_CACHE_MAX_ENTRIES`).
- Memory pool controlado para DataFusion.
- Particionamento de query por tempo/arquivo.
- Leitura separada de dados quentes: memtable, immutable e WAL Parquet.
- Cache em disco e memória para dados/resultado.
- Cache de arquivos recentes opcional (`ZO_CACHE_LATEST_FILES_*`).
- Tantivy/inverted index opcional para full-text/índices secundários.

## Compaction/retention

Além do job do ingester que mescla arquivos antes do upload, existe compactor em `src/service/compact/`.

Ele trabalha em cima do `file_list` e object storage:

- agenda jobs de compactação;
- mescla arquivos antigos/pequenos;
- escreve novos Parquets;
- atualiza file list;
- marca/deleta arquivos antigos;
- aplica retention.

Isso deixa a ingestão rápida e empurra otimização pesada para jobs assíncronos.

## Resposta curta às perguntas

- "Ele manda direto do collector para o backend?" Sim. Collector manda OTLP/HTTP/gRPC para OpenObserve.
- "O backend salva?" Sim, o nó ingester salva primeiro em WAL/memtable local.
- "Ou salva direto do collector?" Não. Collector não grava storage do OpenObserve.
- "Ele salva direto no S3/object storage na ingestão?" Não no caminho principal. Primeiro é WAL local + memtable; depois Parquet local; depois job assíncrono faz upload.
- "O que usa para salvar?" WAL próprio, Arrow em memória, Parquet no disco local, `object_store` para S3/Azure/GCS/local, file list em SQLite/Postgres.
- "O que usa para ler?" Backend com DataFusion lendo Parquet/object store, mais memtable/immutable/WAL local para dados recentes.
- "Lê direto do cliente?" Não. O cliente chama API do backend; backend lê storage/caches/WAL.

## Arquivos mais importantes para estudar

- `src/service/ingestion/mod.rs`: `write_file`, validações e helpers de ingestão.
- `src/ingester/src/writer.rs`: WAL + memtable + rotação.
- `src/ingester/src/partition.rs`: dump de memtable para Parquet local.
- `src/ingester/src/immutable.rs`: fluxo `.wal` -> `.par` -> `.parquet`.
- `src/job/files/parquet.rs`: scan/merge/upload dos Parquets locais.
- `src/infra/src/storage/mod.rs`: trait e facade de object storage.
- `src/infra/src/storage/remote.rs`: S3/Azure/GCS e multipart/retries.
- `src/infra/src/file_list/*`: metadados dos arquivos.
- `src/service/search/datafusion/exec.rs`: criação do DataFusion context/table.
- `src/service/search/grpc/wal.rs`: leitura de dados recentes no ingester.
- `web/src/services/search.ts`: frontend chamando backend.
