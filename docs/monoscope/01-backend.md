# Backend

## Linguagem e framework

O backend e Haskell. O arquivo `monoscope.cabal` mostra um executavel `monoscope-server` e uma biblioteca grande com modulos de pages, models, jobs, ingestao, AI e API.

Principais bibliotecas:

- Servidor HTTP/API: `servant`, `servant-server`, `servant-lucid`, `servant-htmx`, `warp`, `wai`, `wai-extra`, `wai-cors`, `wai-middleware-static`.
- HTML server-side: `lucid`, `lucid-htmx`, `lucid-hyperscript`.
- Efeitos/arquitetura interna: `effectful`, `effectful-core`, `effectful-th`.
- Banco: `hasql`, `hasql-pool`, `hasql-transaction`, `postgresql-simple`, `postgresql-entity`, `postgresql-migration`.
- Jobs: `odd-jobs`.
- OpenTelemetry interno e ingestao: `hs-opentelemetry-*`, `proto-lens`, `proto-lens-runtime`, `grapesy`.
- Mensageria: `hw-kafka-client`, `gogol-pubsub`.
- Object storage: `minio-hs`.
- AI: `openai`, `langchain-hs`.
- Email/notificacoes: `smtp-mail`, `mime-mail`, integrations via Slack/Discord/WhatsApp/PagerDuty.

## Processo de runtime

`src/System/Server.hs` centraliza o processo:

- Sobe o servidor HTTP Warp na porta `PORT`.
- Aplica CORS, gzip, heartbeat e middleware OpenTelemetry WAI.
- Sobe servidor OTLP/gRPC na porta `GRPC_PORT`.
- Sobe `odd-jobs` para background jobs.
- Se habilitado, sobe PubSub consumer.
- Se habilitado, sobe Kafka consumer para telemetria.
- Se habilitado, sobe Kafka consumer de replay.
- Sobe shards do extraction worker, drain flushers, rehydration worker, error decay, session backfill e schema flusher.

Esse desenho permite que ingestao, UI, jobs e derivacao rodem no mesmo binario.

## Configuracao

`src/System/Config.hs` concentra `EnvConfig`, incluindo:

- `DATABASE_URL`
- `TIMEFUSION_PG_URL`
- `PORT`
- `GRPC_PORT`
- `ENABLE_PUBSUB_SERVICE`
- `ENABLE_KAFKA_SERVICE`
- `ENABLE_BACKGROUND_JOBS`
- `ENABLE_REPLAY_SERVICE`
- `ENABLE_TIMEFUSION_READS`
- `ENABLE_TIMEFUSION_WRITES`
- credenciais SMTP, Slack, Discord, GitHub, OpenAI, S3, billing e outros.

## Banco e jobs

O projeto usa PostgreSQL/TimescaleDB como store operacional e analitico. A tabela `background_jobs` e criada nas migrations e usada pelo `odd-jobs`. O scheduler diario cria tarefas como:

- `DailyJob`
- `HourlyJob`
- `ReportUsage`
- `WeeklyReports`
- `QueryMonitorsCheck`
- `CompressReplaySessions`
- `ExpireReplayData`
- derivacoes de issues, patterns, facets e safety-net reprocess.

## Arquitetura de efeitos

O codigo usa `Effectful` para injetar DB, logging, time, tracing, UUID, HTTP e notificacoes. Isso aparece em quase todos os handlers e jobs, por exemplo `ATAuthCtx`, `ATBackgroundCtx`, `DB es`, `Log :> es`, `Tracing :> es`.

## Fontes no codigo

- `monoscope.cabal`
- `src/System/Server.hs`
- `src/System/Config.hs`
- `src/BackgroundJobs.hs`
- `static/migrations/0001_create_monoscope_tables.sql`
