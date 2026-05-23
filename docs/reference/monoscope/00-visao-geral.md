# Monoscope - visao geral da arquitetura

Projeto analisado: `/home/gabriel-carvalho/Documents/loglog/otel/monoscope`

## Resumo executivo

O Monoscope e uma aplicacao Haskell monolitica, mas organizada como varias "fatias" internas: servidor HTTP, servidor OTLP/gRPC, consumidores Kafka/PubSub, worker de jobs, worker de extracao/derivacao e UI server-rendered.

O fluxo principal e:

1. Clientes/SDKs/OpenTelemetry Collector enviam traces, logs e metrics por OTLP/gRPC para o backend, ou para um collector externo que publica em Kafka.
2. O backend Haskell decodifica OTLP, resolve o projeto via API key, normaliza atributos e grava em banco.
3. O storage quente padrao no codigo e PostgreSQL/TimescaleDB: `otel_logs_and_spans` para logs/traces e `telemetry.metrics` para metrics.
4. Opcionalmente, com flags, o backend tambem faz dual-write/leitura para TimeFusion via interface PostgreSQL. O projeto se apresenta como "S3-native", mas o codigo atual ainda mantem TimescaleDB como caminho primario da telemetria.
5. S3/MinIO e usado de forma clara para session replay/rrweb, e tambem existe configuracao BYO S3 por projeto.
6. A UI e majoritariamente Haskell/Lucid + HTMX, com componentes JS/TS para graficos, editor e replay.
7. AI, reports, MCP, dashboards e bots rodam dentro do mesmo backend, usando banco e jobs assicronos.

## Componentes principais

- `app/Main.hs` / `src/Start.hs`: inicializacao do processo e OpenTelemetry interno.
- `src/System/Server.hs`: sobe Warp HTTP, OTLP gRPC, background jobs, Kafka/PubSub, replay worker e extraction workers.
- `src/Web/Routes.hs`: rotas Servant para UI e API publica.
- `src/Opentelemetry/OtlpServer.hs`: servidor OTLP/gRPC de logs, traces e metrics.
- `src/ProcessMessage.hs`: caminho de mensagens legadas/PubSub, convertendo request messages para spans.
- `src/Models/Telemetry/Telemetry.hs`: persistencia principal de logs/spans/metrics.
- `src/BackgroundJobs.hs`: scheduler, reports, derivacoes, anomaly processing e notificacoes.
- `src/Pkg/AI.hs`: agente LLM com tool calling.
- `src/Web/MCP.hs`: endpoint MCP JSON-RPC.
- `src/Pages/Dashboards.hs` e `src/Models/Projects/Dashboards.hs`: dashboards, templates YAML e schemas JSONB.

## Stack macro

- Backend: Haskell, Servant, Warp/WAI, Effectful, Hasql/PostgreSQL, postgresql-simple, odd-jobs, proto-lens, gRPC via `grapesy`, OpenTelemetry Haskell, Kafka, Google PubSub, MinIO/S3, OpenAI/Langchain.
- Frontend: server-rendered HTML com Lucid, HTMX, Hyperscript, Tailwind, DaisyUI, ECharts, GridStack, componentes Lit/Vite/TypeScript.
- Banco: PostgreSQL/TimescaleDB no docker-compose local.
- Storage alternativo: TimeFusion via PGWire quando `ENABLE_TIMEFUSION_*` esta ligado.
- Object storage: S3/MinIO para replay e BYO bucket.

## Observacao importante sobre "S3 storage"

O README fala em "Open-source observability platform with S3 storage" e "Powered by TimeFusion". No codigo, a gravacao de logs/spans/metrics nao sai direto do collector para S3. O caminho implementado e collector/cliente -> backend Monoscope -> Postgres/TimescaleDB, com opcao de dual-write para TimeFusion. S3 direto aparece de forma implementada para replay events e configuracao de bucket por projeto.

## Fontes no codigo

- `README.md`
- `docker-compose.yml`
- `monoscope.cabal`
- `src/System/Server.hs`
- `src/Web/Routes.hs`
- `src/System/Config.hs`
- `src/Models/Telemetry/Telemetry.hs`
