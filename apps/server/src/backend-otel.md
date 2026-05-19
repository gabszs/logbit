# OpenTelemetry — Node.js Setup

Instrumentação automática com OpenTelemetry para aplicações Node.js, exportando traces e métricas via OTLP para o Grafana Cloud APM.

## Arquivo de instrumentação

Instale as dependências (npm ou pnpm):

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/sdk-metrics \
  @opentelemetry/semantic-conventions \
  @opentelemetry/api
```

Crie um arquivo `otel.ts` na raiz do projeto com o seguinte conteúdo:

```ts
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "qualiapp-api",
    [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION ?? "1.0.0",
  }),
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": false,
      "@opentelemetry/instrumentation-dns": false,

      "@opentelemetry/instrumentation-http": true,
      "@opentelemetry/instrumentation-express": true,
      "@opentelemetry/instrumentation-undici": true,

      "@opentelemetry/instrumentation-mysql2": true,
      "@opentelemetry/instrumentation-mongodb": true,

      "@opentelemetry/instrumentation-ioredis": true,

      "@opentelemetry/instrumentation-aws-sdk": true,

      "@opentelemetry/instrumentation-fastify": false,
      "@opentelemetry/instrumentation-pg": false,
      "@opentelemetry/instrumentation-redis-4": false,
    }),
  ],
});

diag.setLogger(new DiagConsoleLogger(), {
  logLevel: DiagLogLevel.WARN,
  suppressOverrideMessage: true,
});

sdk.start();
```

As seguintes instrumentações estão habilitadas:

| Instrumentação | Status |
|---|---|
| `http` | habilitado |
| `express` | habilitado |
| `undici` | habilitado |
| `mysql2` | habilitado |
| `mongodb` | habilitado |
| `ioredis` | habilitado |
| `aws-sdk` | habilitado |
| `fastify` | desabilitado |
| `pg` | desabilitado |
| `fs` | desabilitado |
| `dns` | desabilitado |

---

## Como rodar

O arquivo de instrumentação precisa ser carregado antes da aplicação principal com `--require`:

```bash
node --require ./dist/otel.js dist/index.js
```

Com `ts-node`:

```bash
node --require ts-node/register --require ./src/otel.ts src/index.ts
```

---

## Variáveis de ambiente

Adicione as seguintes variáveis no ambiente da aplicação (`.env`, painel de deploy, etc.):

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://<zona>.otlp.grafana.net
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <credencial>"
OTEL_SERVICE_NAME=qualiapp-api
OTEL_SERVICE_VERSION=1.0.0
```

Os valores de `OTEL_EXPORTER_OTLP_ENDPOINT` e `OTEL_EXPORTER_OTLP_HEADERS` são fornecidos pelo Grafana Cloud — quem configurou o stack já tem essas credenciais.

---

## Verificando a telemetria

Acesse o [Grafana Cloud APM](https://qualidocmonitor.grafana.net/a/grafana-app-observability-app/landing?var-tempo=grafanacloud-traces) para confirmar se os dados estão chegando.

Após subir a aplicação com as variáveis configuradas, em alguns segundos devem aparecer:
- **Traces** — requisições HTTP, queries MySQL/MongoDB, operações Redis e AWS SDK
- **Métricas** — latência, throughput, contadores por serviço

