# HyperDX JS SDK — Análise de Instrumentação Frontend

Repositórios analisados: `otel/hyperdx-js` (SDK) e `otel/hyperdx` (app completo)

---

## Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Session Recording (Replay)](#2-session-recording-replay)
3. [Traces — Instrumentação Automática](#3-traces--instrumentação-automática)
4. [Error Handling Global](#4-error-handling-global)
5. [Métricas](#5-métricas)
6. [Logs](#6-logs)
7. [Context Propagation](#7-context-propagation)
8. [Serialização e Protocolo](#8-serialização-e-protocolo)
9. [Inicialização e Configuração](#9-inicialização-e-configuração)
10. [Dependências](#10-dependências)
11. [Resumo Comparativo](#11-resumo-comparativo)
12. [Correlação Replay ↔ Traces na Timeline](#12-correlação-replay--traces-na-timeline)

---

## 1. Visão Geral da Arquitetura

O HyperDX JS SDK é composto por três pacotes principais:

```
packages/
├── otel-web/                     # RUM (Real User Monitoring) principal
├── session-recorder/             # Gravação de sessão via RRWeb
└── instrumentation-exception/    # Captura de erros (browser + node)
```

**Fluxo de dados resumido:**

```
Browser
  └─► Instrumentações automáticas (fetch, XHR, erros, cliques, etc.)
        └─► Spans criados com contexto e atributos
              └─► HyperDXBatchSpanProcessor (buffer 4s / 50 spans)
                    └─► OTLPTraceExporter → POST /v1/traces (protobuf)

  └─► RRWeb (DOM mutations + eventos de usuário)
        └─► BatchLogProcessor (buffer 5s)
              └─► OTLPLogExporter → POST /v1/logs (protobuf + gzip)
```

---

## 2. Session Recording (Replay)

### O que é e como funciona

O sistema de gravação de sessão usa **[rrweb](https://github.com/rrweb-io/rrweb)** para capturar todas as interações do usuário. **Não é vídeo** — são eventos JSON estruturados que descrevem mutações do DOM e ações do usuário, permitindo replay fiel sem transmitir imagens ou vídeos.

**Arquivo principal:** `packages/session-recorder/src/index.ts`

### Tipos de eventos capturados pelo RRWeb

| Tipo | Descrição |
|------|-----------|
| Full snapshot | Captura completa do DOM (tirada periodicamente) |
| Incremental snapshot | Mutações do DOM (atributos, texto, nós) |
| Mouse move | Posição do cursor |
| Mouse interaction | Cliques, hover, focus, blur |
| Scroll | Scroll de elementos |
| Viewport resize | Redimensionamento da janela |
| Input | Valores de inputs (mascarados por padrão) |
| Media interaction | Play, pause, seek |
| Custom event | Eventos injetados manualmente |

### Mascaramento de dados sensíveis

Por padrão, todas as entradas e textos são mascarados:

```typescript
// packages/session-recorder/src/index.ts
const inited = record({
  maskAllInputs: true,      // Mascara todos inputs
  maskTextSelector: '*',    // Mascara todo texto
  ...rrwebConf,             // Opções customizáveis pelo usuário
  emit(srcEvent) { ... },
});
```

### Limites e proteções

**Arquivo:** `packages/session-recorder/src/sessionrecording-utils.ts`

```typescript
const MAX_RECORDING_LENGTH = (4 * 60 + 1) * 60 * 1000;  // 4 horas máximo
const MAX_CHUNK_SIZE = 950 * 1024;                         // ~950KB por chunk
```

**MutationRateLimiter:** Implementa token bucket algorithm para evitar sobrecarga do coletor em páginas com muitas animações/mudanças rápidas de DOM.

### Como eventos são enviados via OTel

Eventos RRWeb são serializados e enviados como **OTLP Logs**, não como traces:

**Arquivo:** `packages/session-recorder/src/OTLPLogExporter.ts`

```typescript
// Cada evento RRWeb vira um LogRecord
constructLogData(logs: Log[]): proto.LogsData {
  return {
    resourceLogs: [{
      scopeLogs: [{
        scope: { name: 'rum.rr-web', version: VERSION },
        logRecords: logs.map((log) => ({
          body: convertToAnyValue(log.body),      // JSON do evento RRWeb
          timeUnixNano: log.timeUnixNano * 1000000,
          attributes: convertToAnyValue(log.attributes),
        })),
      }],
    }],
  };
}

// Serializa em protobuf + gzip e envia via fetch
const buffer = LogsData.encode(logsData).finish();
const compressed = gzipSync(buffer);
fetch(this.config.beaconUrl, {
  method: 'POST',
  body: compressed,
  headers: {
    'Content-Type': 'application/x-protobuf',
    'Content-Encoding': 'gzip',
  },
});
```

### Atributos nos LogRecords de replay

| Atributo | Significado |
|----------|-------------|
| `rr-web.offset` | Índice sequencial do log na sessão |
| `rr-web.event` | ID do tipo de evento RRWeb |
| `rr-web.chunk` | Número do chunk (eventos grandes são fatiados) |
| `rr-web.total-chunks` | Total de chunks para este evento |

### Batch processing dos logs de replay

**Arquivo:** `packages/session-recorder/src/BatchLogProcessor.ts`

- Flush automático a cada **5 segundos**
- Flush forçado quando a página é fechada (`visibilitychange`, `pagehide`)

---

## 3. Traces — Instrumentação Automática

### Entry point

**Arquivo:** `packages/otel-web/src/index.ts`  
**Objeto:** `Rum` (exportado como default)  
**Inicialização:** `Rum.init(options)`

### Instrumentações registradas automaticamente

```typescript
// packages/otel-web/src/index.ts — INSTRUMENTATIONS array
const INSTRUMENTATIONS = [
  { Instrument: SplunkDocumentLoadInstrumentation,       confKey: 'document',     disable: false },
  { Instrument: HyperDXXMLHttpRequestInstrumentation,   confKey: 'xhr',          disable: false },
  { Instrument: SplunkUserInteractionInstrumentation,   confKey: 'interactions', disable: false },
  { Instrument: SplunkPostDocLoadResourceInstrumentation, confKey: 'postload',   disable: false },
  { Instrument: HyperDXFetchInstrumentation,            confKey: 'fetch',        disable: false },
  { Instrument: SplunkWebSocketInstrumentation,         confKey: 'websocket',    disable: true  },
  { Instrument: SplunkLongTaskInstrumentation,          confKey: 'longtask',     disable: false },
  { Instrument: HyperDXErrorInstrumentation,            confKey: 'error',        disable: false },
  { Instrument: SplunkPageVisibilityInstrumentation,    confKey: 'visibility',   disable: true  },
  { Instrument: SplunkConnectivityInstrumentation,      confKey: 'connectivity', disable: true  },
  { Instrument: SplunkSocketIoClientInstrumentation,    confKey: 'socketio',     disable: true  },
  { Instrument: HyperDXConsoleInstrumentation,          confKey: 'console',      disable: true  },
];
```

Instrumentações com `disable: true` estão disponíveis mas não ativas por padrão.

### Document Load

**Arquivo:** `packages/otel-web/src/SplunkDocumentLoadInstrumentation.ts`

Gera spans para o carregamento da página com atributos adicionais:

```typescript
function addExtraDocLoadTags(span: api.Span) {
  span.setAttribute('document.referrer', document.referrer);
  span.setAttribute('screen.xy', `${window.screen.width}x${window.screen.height}`);
}
```

### Fetch Instrumentation

**Arquivo:** `packages/otel-web/src/HyperDXFetchInstrumentation.ts`

Além do tracing básico de fetch, suporta captura avançada quando habilitado:

```typescript
config.applyCustomAttributesOnSpan = function (span, request, response) {
  span.updateName(`HTTP ${(request.method || 'GET').toUpperCase()}`);
  if (config.advancedNetworkCapture?.()) {
    // Captura headers de request/response
    // Captura body de request/response
    span.setAttribute('http.request.body', request.body.toString());
    span.setAttribute('http.response.body', response.text());
  }
};
```

### XHR Instrumentation

**Arquivo:** `packages/otel-web/src/HyperDXXMLHttpRequestInstrumentation.ts`

Mesmo comportamento do Fetch — wrapping via shimmer para capturar headers e bodies quando `advancedNetworkCapture` está habilitado.

### User Interactions

**Arquivo:** `packages/otel-web/src/SplunkUserInteractionInstrumentation.ts`

Eventos DOM capturados automaticamente:

```typescript
export const DEFAULT_AUTO_INSTRUMENTED_EVENTS = {
  // Pointer
  click: true, dblclick: true, mousedown: true, mouseup: true,
  // Form
  submit: true, reset: true, change: true,
  // Drag
  dragend: true, drop: true,
  // Media
  ended: true, pause: true, play: true,
};
```

### Long Tasks

**Arquivo:** `packages/otel-web/src/SplunkLongTaskInstrumentation.ts`

Detecta tarefas que bloqueiam a thread principal por mais de 50ms (PerformanceLongTaskTiming API).

### Correlação Frontend ↔ Backend

**Arquivo:** `packages/otel-web/src/servertiming.ts`

Captura o `traceparent` embutido no header `Server-Timing` das respostas HTTP e associa ao span de frontend como link:

```typescript
const HeaderRegex = /traceparent;desc=['"]00-([0-9a-f]{32})-([0-9a-f]{16})-01['"]/;

span.setAttribute('link.traceId', match[1]);  // traceId do backend
span.setAttribute('link.spanId', match[2]);   // spanId do backend
```

### Geração de IDs

**Arquivo:** `packages/otel-web/src/utils.ts`

```typescript
// IDs aleatórios (não criptograficamente seguros)
export function generateId(bits: number): string {
  const xes = 'x'.repeat(bits / 4);
  return xes.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}
// Session ID = 128 bits (32 chars hex)
// Trace/Span IDs = padrão W3C traceparent
```

### Batch Span Processor

**Arquivo:** `packages/otel-web/src/HyperDXBatchSpanProcessor.ts`

Estende o `BatchSpanProcessor` do OTel com flush forçado na saída da página:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    void this.forceFlush();
  }
});
document.addEventListener('pagehide', () => void this.forceFlush());
```

**Configuração padrão:**
- Timeout de flush: **4000ms**
- Tamanho máximo do batch: **50 spans**

### Session-Based Sampler

**Arquivo:** `packages/otel-web/src/SessionBasedSampler.ts`

Permite amostragem por sessão: x% das sessões são rastreadas a 100%, em vez de x% de cada span individualmente. Isso garante traces completos para as sessões selecionadas.

---

## 4. Error Handling Global

### Arquivo principal

`packages/instrumentation-exception/src/browser/instrumentations/HyperDXErrorInstrumentation.ts`

### Quatro listeners registrados

```typescript
enable(): void {
  // 1. Erros em console.error()
  shimmer.wrap(console, 'error', this._consoleErrorHandler);

  // 2. Promises rejeitadas sem handler
  window.addEventListener('unhandledrejection', this._unhandledRejectionListener);

  // 3. Erros JavaScript globais (window.onerror)
  window.addEventListener('error', this._errorListener);

  // 4. Erros de recursos (imagens, scripts que falham ao carregar)
  document.documentElement.addEventListener('error', this._documentErrorListener, { capture: true });
}
```

### Roteamento por tipo de erro

```typescript
public hdxReport(source: string, arg: ...): void {
  if (arg instanceof Error)       → hdxReportError()       // Stack trace completo
  if (arg instanceof ErrorEvent)  → hdxReportErrorEvent()  // window.onerror
  if (arg instanceof Event)       → hdxReportEvent()       // Erros de recursos DOM
  if (typeof arg === 'string')    → hdxReportString()      // console.error('msg')
  if (arg instanceof Array)       → junta strings, extrai primeiro Error
}
```

### Atributos no span de erro

| Atributo | Valor |
|----------|-------|
| `component` | `"error"` |
| `error` | `true` |
| `error.object` | Nome da classe do erro (ex: `TypeError`) |
| `error.message` | Mensagem (máx 1024 chars) |
| `error.stack` | Stack trace (máx 4096 chars) |
| `target_element` | Tag do elemento DOM (para erros de recurso) |
| `target_xpath` | XPath do elemento |
| `target_src` | `src` do elemento (para imagens/scripts) |

### Pipeline de processamento de exceções

**Arquivo:** `packages/instrumentation-exception/src/browser/index.ts`

Usa um pipeline de integrations estilo Sentry para enriquecer eventos de erro:

| Integration | Função |
|-------------|--------|
| `globalhandlers` | Registra handlers window.onerror e unhandledrejection |
| `browserapierrors` | Captura erros de APIs do browser (fetch, console, etc.) |
| `contextlines` | Adiciona linhas de contexto ao stack trace |
| `httpcontext` | Adiciona URL, método HTTP, status code ao evento |
| `linkederrors` | Captura cadeia de erros (`error.cause`) |
| `reportingobserver` | Captura deprecation/intervention warnings via ReportingObserver API |

---

## 5. Métricas

### Web Vitals

**Arquivo:** `packages/otel-web/src/webvitals.ts`  
**Biblioteca:** `web-vitals@3.3.2`

Cada métrica vira um span com o valor como atributo:

```typescript
function report(name: string, metric: Metric): void {
  const span = tracer.startSpan('webvitals', { startTime: now });
  span.setAttribute(name, metric.value);
  span.end(now);
}

callbacks.onFID((m)  => report('fid', m));   // First Input Delay
callbacks.onCLS((m)  => report('cls', m));   // Cumulative Layout Shift
callbacks.onLCP((m)  => report('lcp', m));   // Largest Contentful Paint
callbacks.onINP((m)  => report('inp', m));   // Interaction to Next Paint
callbacks.onFCP((m)  => report('fcp', m));   // First Contentful Paint
callbacks.onTTFB((m) => report('ttfb', m));  // Time to First Byte
```

Cada métrica é reportada **uma única vez** por page load (verificação via `reported` object).

### Custom Actions (métricas manuais)

**Arquivo:** `packages/otel-web/src/index.ts`

```typescript
Rum.addAction(name: string, attributes?: Attributes)
// Cria um span instantâneo com os atributos fornecidos
// Útil para medir eventos de negócio (ex: "checkout_completed")
```

### Atributos globais em todos os spans

**Arquivo:** `packages/otel-web/src/SplunkSpanAttributesProcessor.ts`

Adicionados automaticamente em cada span via `onStart()`:

```typescript
onStart(span: Span): void {
  span.setAttribute('location.href', location.href);  // URL atual
  span.setAttributes(this._globalAttributes);          // Atributos customizados do usuário
}
```

**Resource attributes** (adicionados a todos os spans via Resource):

| Atributo | Valor |
|----------|-------|
| `service.name` | `applicationName` configurado |
| `telemetry.sdk.name` | `@hyperdx/otel-web` |
| `telemetry.sdk.version` | Versão do SDK |
| `rum.version` | Versão do SDK |
| `rum.scriptInstance` | ID único desta instância do script |
| `rum.sessionId` | ID da sessão atual (getter dinâmico) |

---

## 6. Logs

O SDK não usa o OTLP Logs pipeline para logs de aplicação convencionais. Os logs seguem dois caminhos:

### Console Logs (via HyperDXConsoleInstrumentation)

**Arquivo:** `packages/otel-web/src/HyperDXConsoleInstrumentation.ts`

Quando habilitada, cada `console.log/info/warn/debug` vira um **span** (não um log OTLP):

```typescript
private _createSpan(type: string, ...args: any[]) {
  const span = this.tracer.startSpan(`console.${type}`);
  span.setAttribute('component', 'console');
  span.setAttribute('level', type === 'log' ? 'info' : type);
  span.setAttribute('message', bodyMsg);
  span.end(now);
}
```

Métodos wrappados: `console.debug`, `console.info`, `console.log`, `console.warn`

*Esta instrumentação está desativada por padrão (`disable: true`).*

### Session Recording Logs

Eventos RRWeb são enviados como OTLP Logs (detalhado na seção 2).

---

## 7. Context Propagation

### SplunkContextManager

**Arquivo:** `packages/otel-web/src/SplunkContextManager.ts`

É o componente mais complexo do SDK. Mantém o contexto OTel ativo através de operações assíncronas via monkey-patching:

| API patcheada | Razão |
|---------------|-------|
| `setTimeout` / `clearTimeout` | Callbacks assíncronos com delay |
| `setInterval` / `clearInterval` | Callbacks periódicos |
| `requestAnimationFrame` | Callbacks de animação |
| `Promise.then/catch/finally` | Cadeia de Promises |
| `MutationObserver` | Observers de DOM |
| `XMLHttpRequest` eventos | Eventos de XHR |
| `window` event listeners | Eventos globais do browser |
| `MessageChannel` / `MessagePort` | Comunicação entre workers |
| `EventTarget.addEventListener` | Todos event listeners DOM |

**Lógica:** Quando um span está ativo e um callback assíncrono é registrado, o contexto atual é "bindado" ao callback. Quando o callback executa (mesmo muito mais tarde), o contexto OTel correto está disponível, permitindo que novos spans sejam criados como filhos do span original.

### Session Tracking

**Arquivo:** `packages/otel-web/src/session.ts`

- Session ID tem 128 bits (32 chars hex)
- Persistido em cookie ou localStorage
- Renovado automaticamente após inatividade
- `rum.sessionId` é um getter dinâmico no Resource (atualiza se a sessão renovar)

---

## 8. Serialização e Protocolo

### Traces

| Propriedade | Valor |
|-------------|-------|
| Protocolo | OTLP HTTP |
| Formato | Protocol Buffers ou JSON |
| Compressão | Nenhuma (depende do coletor) |
| Content-Type | `application/x-protobuf` ou `application/json` |
| Endpoint padrão | `https://in-otel.hyperdx.io/v1/traces` |
| Autenticação | Header `Authorization` com API key |

### Logs (Session Recording)

| Propriedade | Valor |
|-------------|-------|
| Protocolo | OTLP HTTP |
| Formato | Protocol Buffers |
| Compressão | gzip (via fflate) |
| Content-Type | `application/x-protobuf` |
| Content-Encoding | `gzip` |
| Endpoint padrão | `https://in-otel.hyperdx.io/v1/logs` |

### Estrutura de um span de trace (OTLP)

```
TracesData
└── ResourceSpans[]
    ├── Resource { attributes: { service.name, rum.sessionId, ... } }
    └── ScopeSpans[]
        ├── Scope { name: "instrumentation-name", version }
        └── Spans[]
            ├── traceId     (16 bytes / 32 hex chars)
            ├── spanId      (8 bytes / 16 hex chars)
            ├── parentSpanId (opcional)
            ├── name        (ex: "HTTP GET", "click", "webvitals")
            ├── kind        (INTERNAL | CLIENT | SERVER)
            ├── startTimeUnixNano
            ├── endTimeUnixNano
            ├── attributes  { component, http.method, http.url, error, location.href, ... }
            └── status      { code: OK | ERROR | UNSET }
```

### Estrutura de um log record de replay (OTLP)

```
LogsData
└── ResourceLogs[]
    ├── Resource { attributes: { service.name, rum.sessionId, ... } }
    └── ScopeLogs[]
        ├── Scope { name: "rum.rr-web", version }
        └── LogRecords[]
            ├── body           (JSON string do evento RRWeb)
            ├── timeUnixNano
            └── attributes     { rr-web.offset, rr-web.event, rr-web.chunk, rr-web.total-chunks }
```

---

## 9. Inicialização e Configuração

### Configuração mínima

```typescript
import Rum from '@hyperdx/otel-web';

Rum.init({
  url: 'https://seu-coletor/v1/traces',
  apiKey: 'sua-api-key',
  applicationName: 'minha-app',
  deploymentEnvironment: 'production',
  version: '1.0.0',
});
```

### Com session recording

```typescript
import Rum from '@hyperdx/otel-web';
import RumRecorder from '@hyperdx/otel-web-session-recorder';

Rum.init({ /* ... */ });

RumRecorder.init({
  url: 'https://seu-coletor/v1/logs',
  apiKey: 'sua-api-key',
  maskAllInputs: true,
  maskTextSelector: '*',     // Mascara todo texto visível
  scheduledDelayMillis: 5000, // Flush a cada 5s
});
```

### Opções avançadas

```typescript
Rum.init({
  // Captura bodies e headers de requests/responses
  advancedNetworkCapture: () => true,

  // Atributos customizados em todos os spans
  globalAttributes: {
    'user.id': '123',
    'tenant.id': 'acme',
  },

  // Amostragem baseada em sessão (ex: 10% das sessões)
  spanProcessor: {
    factory: (exporter, config) =>
      new SessionBasedSamplerProcessor(exporter, { sessionSampleRate: 0.1 }),
  },

  // Desabilitar instrumentações específicas
  instrumentations: {
    fetch: false,
    websocket: true,   // Habilitar WebSocket tracing
    console: true,     // Habilitar console logging
  },
});
```

### Fluxo interno de inicialização

```
Rum.init(options)
  1. Validação de ambiente (é browser?)
  2. initSessionTracking() — inicia cookie/localStorage de sessão
  3. new SplunkWebTracerProvider({ resource }) — cria provider com resource attributes
  4. Cria instâncias de cada instrumentação configurada
  5. provider.addSpanProcessor(SplunkSpanAttributesProcessor) — atributos globais
  6. provider.addSpanProcessor(HyperDXBatchSpanProcessor) — exportação em batch
  7. provider.register({ contextManager: SplunkContextManager }) — patches async
  8. registerInstrumentations({ instrumentations }) — ativa todos os patches
  9. initWebVitals(provider) — registra listeners de Web Vitals
```

---

## 10. Dependências

### otel-web

| Pacote | Versão | Uso |
|--------|--------|-----|
| `@opentelemetry/api` | 1.8.0 | API base OTel |
| `@opentelemetry/sdk-trace-web` | 1.24.1 | Web Tracer SDK |
| `@opentelemetry/sdk-trace-base` | 1.24.1 | Base SDK |
| `@opentelemetry/exporter-trace-otlp-http` | 0.51.1 | HTTP Exporter |
| `@opentelemetry/instrumentation` | 0.51.1 | Base instrumentation |
| `@opentelemetry/instrumentation-document-load` | 0.38.0 | Page load |
| `@opentelemetry/instrumentation-fetch` | 0.51.1 | Fetch API |
| `@opentelemetry/instrumentation-xml-http-request` | 0.51.1 | XHR |
| `@opentelemetry/instrumentation-user-interaction` | 0.38.0 | DOM events |
| `web-vitals` | 3.3.2 | Core Web Vitals |
| `shimmer` | 1.2.1 | Monkey patching |

### session-recorder

| Pacote | Versão | Uso |
|--------|--------|-----|
| `rrweb` | 1.1.3 | DOM recording |
| `fflate` | 0.7.4 | Compressão gzip |
| `protobufjs` | 6.11.2 | Serialização Protocol Buffers |
| `long` | 5.2.3 | Números long (protobuf) |

### instrumentation-exception

Usa pipeline de processamento estilo Sentry internamente, com integrations plugáveis.

---

## 11. Resumo Comparativo

| Aspecto | Tecnologia | Detalhe |
|---------|-----------|---------|
| **Session recording** | rrweb 1.1.3 | Eventos JSON, não vídeo; DOM mutations + user events |
| **Encoding de replay** | Protobuf + gzip | Chunks de ~950KB, flush a cada 5s |
| **Traces** | OpenTelemetry 1.24.1 | Distributed tracing com W3C traceparent |
| **Session ID** | 128-bit hex | Persistido em cookie/localStorage, renovável |
| **Correlação FE↔BE** | Server-Timing header | Captura `traceparent` de respostas HTTP |
| **Error capture** | 4 listeners globais | `onerror`, `unhandledrejection`, `console.error`, capture errors |
| **Métricas** | web-vitals 3.3.2 | FID, CLS, LCP, INP, FCP, TTFB (cada um único por load) |
| **Context async** | SplunkContextManager | Patches setTimeout, Promise, MutationObserver, XHR, MessageChannel |
| **Batch traces** | HyperDXBatchSpanProcessor | 4s / 50 spans; flush forçado em pagehide |
| **Compressão** | gzip via fflate | Apenas para logs de replay; traces sem compressão |
| **Protocolo** | OTLP HTTP | POST protobuf para /v1/traces e /v1/logs |
| **Amostragem** | SessionBasedSampler | Opcional; garante traces completos por sessão |

---

## Observações para Implementação Própria

1. **Session replay sem vídeo:** A chave é usar rrweb para serializar o DOM como JSON e enviar como OTLP Logs. O replay acontece no frontend do observability tool ao "reidratar" os eventos em ordem.

2. **Correlação sessão ↔ trace:** O `rum.sessionId` é adicionado como resource attribute em **todos** os spans e logs. Isso permite filtrar por sessão e ver todos os traces + replay juntos.

3. **Context propagation é crítico:** Sem o `SplunkContextManager` patcheando APIs async, spans criados dentro de `setTimeout` ou `.then()` não teriam parentSpanId correto e o trace ficaria fragmentado.

4. **Flush na saída da página:** Tanto o `HyperDXBatchSpanProcessor` quanto o `BatchLogProcessor` registram listeners de `visibilitychange` e `pagehide` para garantir que dados não sejam perdidos quando o usuário fecha a aba.

5. **Chunking de eventos grandes:** Full snapshots de DOM podem ser muito grandes. O sistema fatia eventos maiores que 950KB em múltiplos chunks com metadados `rr-web.chunk` / `rr-web.total-chunks` para que o backend possa remontar.

---

## 12. Correlação Replay ↔ Traces na Timeline

Esta seção descreve como o app HyperDX (`otel/hyperdx`) sincroniza o player de replay do DOM com a lista de eventos (traces, erros, logs) exibida ao lado, formando a timeline interativa.

### A chave: `rum.sessionId` presente nos dois lados

O SDK grava `rum.sessionId` como resource attribute em **tudo**:
- Em cada span de trace (via `SplunkSpanAttributesProcessor`)
- Em cada log record de replay RRWeb (via Resource do session-recorder)

Isso permite duas queries independentes ao ClickHouse com o mesmo filtro:

```sql
-- Query 1: busca os eventos RRWeb (para o player)
SELECT Body, LogAttributes['rr-web.chunk'], LogAttributes['rr-web.total-chunks']
FROM logs_otel
WHERE ResourceAttributes['rum.sessionId'] = 'abc123'
ORDER BY TimestampTime ASC

-- Query 2: busca os spans relevantes (para a timeline)
SELECT Timestamp, SpanName, SpanAttributes['http.status_code'], SpanAttributes['component'], ...
FROM traces
WHERE ResourceAttributes['rum.sessionId'] = 'abc123'
  AND (SpanAttributes['http.status_code']:* OR SpanAttributes['component'] = 'error' OR ...)
ORDER BY Timestamp ASC
LIMIT 4000
```

Os resultados das duas queries são exibidos lado a lado, sincronizados por um único `focus.ts` (timestamp absoluto em ms).

### O clock base: `replayer.getMetaData().startTime`

Esse é o ponto crítico. O RRWeb player expõe:

```typescript
// packages/app/src/DOMPlayer.tsx — linhas 261-264
setPlayerTimeRef.current(
  Math.round(
    replayer.current.getMetaData().startTime +  // timestamp absoluto do 1º evento (ms)
    getPlayerCurrentTime(replayer.current)       // tempo relativo de playback (ms)
  )
);
```

- `startTime` = timestamp UNIX em ms do primeiro evento RRWeb da sessão
- `getCurrentTime()` = posição atual do playback em ms (relativo ao início)
- A soma resulta num **timestamp absoluto UNIX em ms** — o mesmo formato dos spans

Como todos os eventos (spans e logs RRWeb) são gravados com timestamps UNIX absolutos, a comparação é direta: `span.timestamp >= focus.ts`.

### Sincronização via estado `focus`

**Arquivo:** `packages/app/src/SessionSubpanel.tsx`

```typescript
// Estado central de sincronização
const [focus, setFocus] = useState<{ ts: number; setBy: string }>();
// ts = timestamp absoluto em ms (UNIX)
// setBy = 'player' | 'slider' | 'timeline' | 'url'
```

O `focus` flui em duas direções:

**Player → Timeline:**
1. RRWeb player emite posição atual via `requestAnimationFrame`
2. `setPlayerTime(ts)` é chamado com `startTime + getCurrentTime()`
3. `setFocus({ ts, setBy: 'player' })` atualiza o estado
4. `SessionEventList` encontra o evento mais próximo: `rows.findIndex(row => row.timestamp >= focus.ts)`
5. `rowVirtualizer.scrollToIndex(index)` faz auto-scroll para o evento atual

**Timeline/Slider → Player:**
1. Usuário clica num evento da lista ou num marker do playbar
2. `setFocus({ ts: evento.timestamp, setBy: 'slider' })`
3. `DOMPlayer` recebe o novo `focus` e executa:
   ```typescript
   replayer.current.pause(focus.ts - replayer.current.getMetaData().startTime)
   // Converte timestamp absoluto → offset relativo para o RRWeb
   ```

### Como os markers da Playbar são posicionados

**Arquivo:** `packages/app/src/Playbar.tsx`

```typescript
// Posição % de cada evento no slider
const percentage = ((event.ts - minTs) / (maxTs - minTs)) * 100;
// minTs = startTime da sessão
// maxTs = timestamp do último evento
// event.ts = timestamp absoluto do span/erro
```

Resultado visual: dots coloridos no slider representando erros (vermelho), navegação (azul), HTTP requests (cinza), etc., posicionados proporcionalmente na linha do tempo.

### Tipos de eventos exibidos na timeline

**Arquivo:** `packages/app/src/SessionSubpanel.tsx` — query de spans para timeline

| Tipo | Filtro ClickHouse | Ícone |
|------|-------------------|-------|
| HTTP request | `SpanAttributes['http.status_code']:*` | 🌐 |
| Erro JS | `SpanAttributes['component'] = 'error'` | 🔴 |
| Console log | `SpanAttributes['component'] = 'console'` | 📝 |
| Navegação | `SpanName = 'routeChange'` ou `'documentLoad'` | 🔀 |
| Custom action | `ScopeName = 'custom-action'` | ⭐ |

### O papel de `rr-web.offset`

O atributo `rr-web.offset` é um **counter sequencial global** (não temporal) dentro da sessão. Ele garante que o backend possa reconstruir a ordem exata dos eventos caso cheguem fora de ordem no ClickHouse (que não garante ordem de inserção). Junto com `rr-web.event` (ID do evento) e `rr-web.chunk` / `rr-web.total-chunks`, permite remontar eventos grandes que foram fatiados.

```
Evento grande (ex: full DOM snapshot)
  ├── LogRecord: rr-web.offset=5, rr-web.event=42, rr-web.chunk=1, rr-web.total-chunks=3
  ├── LogRecord: rr-web.offset=6, rr-web.event=42, rr-web.chunk=2, rr-web.total-chunks=3
  └── LogRecord: rr-web.offset=7, rr-web.event=42, rr-web.chunk=3, rr-web.total-chunks=3
```

### Diagrama de sincronização

```
ClickHouse
  ├── logs (rum.sessionId=X) → RRWeb events ordenados por TimestampTime
  └── traces (rum.sessionId=X) → Spans ordenados por Timestamp

Frontend App
  │
  ├── DOMPlayer
  │    └── Replayer RRWeb
  │         └── getMetaData().startTime = primeiro evento (ms absoluto)
  │         └── getCurrentTime() = posição relativa (ms)
  │         └── emite: setPlayerTime(startTime + currentTime) ──────────────┐
  │                                                                          │
  ├── focus.ts (ms absoluto) ◄──────────────────────────────────────────────┘
  │        │
  │        ├──► DOMPlayer: replayer.pause(focus.ts - startTime) ← clique na lista
  │        │
  │        └──► SessionEventList
  │              └── findIndex(row => row.timestamp >= focus.ts) → destaca evento
  │              └── scrollToIndex(foundIndex) → auto-scroll
  │
  └── Playbar
       └── markers em % = (event.ts - minTs) / (maxTs - minTs) * 100
```
