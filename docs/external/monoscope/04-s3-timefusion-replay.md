# S3, TimeFusion e replay

## O que salva em S3

O uso direto e claro de S3/MinIO no codigo e para session replay, nao para logs/traces/metrics comuns.

`src/Pages/Replay.hs`:

- Recebe payloads rrweb/replay.
- Resolve credenciais S3 por projeto ou default global.
- Salva cada lote de eventos como objeto JSON em bucket S3/MinIO.
- Mantem metadados no Postgres em `projects.replay_sessions`.
- Periodicamente mergeia varios arquivos em `merged.json.gz`.
- Remove arquivos parciais depois do merge.
- Expira dados de replay do storage default.

## BYO S3 por projeto

`src/Pages/Settings.hs` implementa tela "S3 Bucket":

- Usuario informa access key, secret, region, bucket e endpoint custom.
- Backend valida `bucketExists` usando `minio-hs`.
- Se existir, salva config em `projects.projects.s3_bucket`.
- Essa config e usada em `projectMinioConn`.

Ou seja: o projeto suporta S3-compatible providers como AWS S3, MinIO e DigitalOcean Spaces.

## Como salva replay

`saveReplayMinio` faz:

1. Busca projeto.
2. Se payload tem eventos, monta key `session_id/timestamp.json`.
3. Faz `Minio.putObject`.
4. Atualiza/insere `projects.replay_sessions` com `file_keys`, contador e dados do usuario.
5. Ao passar threshold, agenda job `MergeReplaySession`.

Na leitura:

1. Busca `merged.json.gz`.
2. Se existirem `file_keys`, busca arquivos individuais e combina.
3. Se necessario, tenta formato legado `session_id.json`.
4. Retorna JSON de eventos para o frontend.

## Retencao e merge

Tecnicas encontradas:

- Merge em batches limitados (`maxFilesPerMerge = 25`) para evitar estouro de heap.
- `merged.json.gz` comprimido.
- Concatenacao de arrays JSON por bytes para evitar reparse pesado.
- Tratamento separado de erro transiente, arquivo faltante e corrupcao.
- Exclusao de BYO-bucket no sweep de expiracao default, preservando dados do cliente.
- Retencao anunciada para replay default: 30 dias.

## TimeFusion e S3

O README/docs falam em TimeFusion/S3-native. No codigo, TimeFusion aparece como outro pool PostgreSQL (`timefusionPgPool`) acessado por `TIMEFUSION_PG_URL`, com flags:

- `ENABLE_TIMEFUSION_WRITES`
- `ENABLE_TIMEFUSION_READS`

O backend escreve em TimeFusion via interface SQL/PGWire, nao por API S3 direta no hot path. Se TimeFusion internamente usa S3, isso fica encapsulado fora do codigo Haskell.

## Conclusao sobre storage

- Telemetria normal: backend salva em TimescaleDB/Postgres e opcionalmente em TimeFusion.
- Replay: backend salva em S3/MinIO.
- Collector: nao salva direto em S3; envia para backend ou Kafka.
- S3 BYO: existe e e persistido por projeto, usado diretamente no replay.

## Fontes no codigo

- `src/Pages/Replay.hs`
- `src/Pages/Settings.hs`
- `src/System/Config.hs`
- `src/Models/Projects/Projects.hs`
- `static/migrations/0001_create_monoscope_tables.sql`
- `src/Models/Telemetry/Telemetry.hs`
