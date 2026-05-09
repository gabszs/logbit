# Frontend OpenTelemetry

O frontend (`apps/web`) tem instrumentacao OpenTelemetry opt-in para chamadas HTTP feitas via `fetch`. A configuracao fica centralizada em `apps/web/src/lib/config.ts`, e a inicializacao do SDK fica em `apps/web/src/lib/otel.ts`.

## Como habilitar

OTel so inicializa quando `VITE_OTEL_ENABLED="true"`.

```env
VITE_OTEL_ENABLED="true"
VITE_OTEL_EXPORTER_OTLP_ENDPOINT="http://192.168.1.3:4358"
VITE_OTEL_SERVICE_NAME="loglog-web"
VITE_OTEL_SERVICE_VERSION=""
VITE_OTEL_SAMPLE_RATIO="1"
```

- `VITE_OTEL_EXPORTER_OTLP_ENDPOINT` deve ser a URL base do collector OTLP HTTP, sem `/v1/traces`.
- Se OTel estiver ativo e a URL do collector estiver vazia, o app nao quebra; ele emite um `console.warn` e nao inicializa a instrumentacao.
- Nao existe default de ativacao nem default de collector no codigo. O valor padrao documentado vive apenas no `.env.example`.
- `VITE_OTEL_SAMPLE_RATIO` aceita `0..1`; valores invalidos caem para `1`.

O `main.tsx` importa `./lib/otel` antes dos clients HTTP, para que o patch de `fetch` esteja ativo antes de ORPC, Hono RPC, Better Auth e ClickHouse proxy serem usados.

## O que e instrumentado

A instrumentacao usa `@opentelemetry/instrumentation-fetch`. Portanto, qualquer chamada que passe por `window.fetch` gera span quando OTel esta ativo.

Hoje isso cobre:

- ORPC (`/orpc/*`)
- Hono RPC (`/v1/*`)
- Better Auth (`/v1/auth/*`)
- ClickHouse client via proxy (`/v1/proxy/connections/*`)
- Export OTLP do proprio browser para o collector
- Qualquer outro `fetch` feito pela aplicacao

A propagacao tambem esta aberta para qualquer `fetch` com:

```ts
propagateToUrls: [/.*/]
```

Isso faz o browser injetar `traceparent`, `tracestate` e `baggage` em todos os destinos que aceitarem esses headers via CORS. No server, `apps/server/src/index.ts` libera esses headers em `allowHeaders`.

## Fluxo de trace

1. O usuario interage com o web app.
2. Uma chamada `fetch` gera um span client no browser.
3. O `FetchInstrumentation` injeta headers W3C (`traceparent`, `tracestate`, `baggage`).
4. O server recebe a request e continua o trace via `@hono/otel`.
5. O browser exporta seus spans para `${VITE_OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`.
6. O collector grava os spans no backend configurado, como ClickHouse.

Para o server continuar o mesmo trace, ele precisa rodar com OTel ativo, por exemplo:

```bash
turbo -F server otel-dev
```

## Resource attributes

Os spans do browser usam um resource com atributos do servico e do ambiente do navegador:

- `service.name`: `VITE_OTEL_SERVICE_NAME`, default `loglog-web`
- `service.version`: `VITE_OTEL_SERVICE_VERSION`, opcional
- `user_agent.original`: `navigator.userAgent`
- `os.type`: inferido de `navigator.userAgent`
- `os.name`: `navigator.platform`
- `device.type`: `mobile` ou `desktop`
- `browser.mobile`: boolean
- `browser.platform`: `navigator.platform`
- `browser.language`: `navigator.language`

## HTTP span attributes

A instrumentacao usa semantic conventions estaveis de HTTP com:

```ts
semconvStabilityOptIn: "http"
```

A camada custom complementa os spans com atributos alinhados ao HTTP client span estavel:

- `http.request.method`
- `http.request.method_original`, quando o metodo original difere do normalizado
- `server.address`
- `server.port`, incluindo fallback `80` para HTTP e `443` para HTTPS
- `url.full`
- `url.scheme`
- `url.path`
- `url.query`, quando existe query string
- `http.response.status_code`, quando uma resposta foi recebida
- `error.type`, para respostas `>= 400` ou erro de fetch
- `network.transport = tcp` para HTTP/HTTPS
- `user_agent.original`

Tambem existem atributos especificos do Loglog:

- `loglog.component`: `orpc`, `better-auth`, `clickhouse-client`, `hono-rpc`, `otel-exporter` ou `fetch`
- `loglog.http.query.param_names`: nomes dos parametros de query, sem valores

## Sanitizacao de URL

`url.full` e preenchido com uma URL sanitizada.

Regras atuais:

- username em URL vira `REDACTED`
- password em URL vira `REDACTED`
- query params sensiveis abaixo tem o valor trocado por `REDACTED`:
  - `AWSAccessKeyId`
  - `Signature`
  - `sig`
  - `X-Goog-Signature`

Os nomes dos parametros sao preservados para diagnostico, mas valores sensiveis conhecidos nao sao enviados.

## Observacoes importantes

O `FetchInstrumentation` descarta o segundo argumento de `fetch(Request, init)` quando reexecuta o fetch original. Por isso o ORPC cria um novo `Request` ja com `credentials: "include"` antes de chamar `fetch`; caso contrario os cookies de auth somem quando OTel esta ativo.

Headers de propagacao exigem CORS. Se uma chamada externa falhar depois de habilitar OTel, confirme que o destino aceita `traceparent`, `tracestate` e `baggage` em preflight.

Como `propagateToUrls` esta em `/.*/`, destinos externos tambem recebem headers de trace quando o browser/CORS permitir. Isso e intencional nesta fase para simplificar debugging.

## Verificacao manual

1. Configure `apps/web/.env` com OTel ativo.
2. Suba collector e ClickHouse.
3. Rode o server com OTel:

```bash
turbo -F server otel-dev
```

4. Rode o frontend:

```bash
turbo -F web dev
```

5. Abra DevTools e confirme que requests para o backend incluem `traceparent`.
6. Consulte `otel_traces` e verifique spans com `service.name = loglog-web` e `service.name = loglog-api` no mesmo `TraceId`.
