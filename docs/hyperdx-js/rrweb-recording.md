# Gravação de Sessão com RRWeb — Análise Completa

Repositórios: `otel/hyperdx-js` (SDK) · `otel/hyperdx` (app)  
Arquivos principais: `packages/session-recorder/src/`

---

## Índice

1. [Conceito fundamental — não é vídeo](#1-conceito-fundamental--não-é-vídeo)
2. [Tipos de eventos RRWeb](#2-tipos-de-eventos-rrweb)
3. [Ciclo de vida da gravação](#3-ciclo-de-vida-da-gravação)
4. [Gerenciamento de sessão](#4-gerenciamento-de-sessão)
5. [Proteções e limites](#5-proteções-e-limites)
6. [Serialização e chunking](#6-serialização-e-chunking)
7. [Exportação via OTLP](#7-exportação-via-otlp)
8. [Replay no app](#8-replay-no-app)
9. [Sincronização temporal com traces](#9-sincronização-temporal-com-traces)
10. [Diagrama de fluxo completo](#10-diagrama-de-fluxo-completo)

---

## 1. Conceito fundamental — não é vídeo

O sistema de gravação **não captura pixels nem frames de vídeo**. Em vez disso, o rrweb:

1. **Serializa o DOM** como JSON no momento do início da gravação (full snapshot)
2. **Observa todas as mudanças** do DOM via `MutationObserver` e listeners de eventos
3. **Emite diffs estruturados** (incremental snapshots) a cada mudança

O replay reconstrói o DOM original dentro de um `<iframe>` aplicando esses eventos em ordem cronológica. O resultado visual parece um vídeo, mas é o browser literalmente re-renderizando o DOM do usuário.

**Vantagens sobre vídeo:**
- Tamanho muito menor (JSON vs frames de pixels)
- Permite inspecionar o DOM em qualquer ponto do replay
- Permite mascarar dados sensíveis antes de enviar
- Sem codec, sem latência de encoding

---

## 2. Tipos de eventos RRWeb

Todo evento RRWeb tem a estrutura base `{ type: number, timestamp: number, data: object }`.

| Tipo ID | Nome | Quando ocorre |
|---------|------|---------------|
| `2` | **Full Snapshot** | Início da gravação, troca de sessão, resume após pausa, rate-limit de nó. Serializa o DOM inteiro |
| `3` | **Incremental Snapshot** | Qualquer mudança após o full snapshot (ver sub-tipos abaixo) |
| `4` | **Meta** | Registra a URL (`href`) da página atual |
| `6` | **Plugin Event** | Eventos de plugins customizados do rrweb |

### Sub-tipos de Incremental Snapshot (`type=3`, campo `data.source`)

| Source ID | O que captura |
|-----------|---------------|
| `0` | Mutações do DOM (nós adicionados/removidos, atributos, texto) |
| `1` | Mouse move (posição do cursor) |
| `2` | Mouse interaction (click, hover, focus, blur, dblclick) |
| `3` | Scroll (posição de scroll de elementos) |
| `4` | Viewport resize (redimensionamento da janela) |
| `5` | Input (valor digitado em campos) |
| `7` | Touch move |
| `8` | Media interaction (play, pause, seek) |
| `9` | Style sheet rule (mudanças em CSS via JS) |
| `11` | Canvas mutation |
| `14` | Font load |
| `15` | Log (console logs via plugin) |
| `16` | Drag |

O **Full Snapshot** (tipo 2) é o equivalente a um keyframe de vídeo. Sem ele, o Replayer não consegue construir o estado inicial — todos os incrementais seguintes são aplicados sobre ele.

---

## 3. Ciclo de vida da gravação

### Inicialização

**Arquivo:** `packages/session-recorder/src/index.ts`

```typescript
// RumRecorder.init() — linha 74
inited = record({
  maskAllInputs: true,      // mascara todo input por padrão
  maskTextSelector: '*',    // mascara todo texto visível
  ...rrwebConf,             // opções passadas pelo usuário
  emit(srcEvent) { ... }    // callback chamado a cada evento
});
```

`record()` retorna uma função de cleanup (armazenada em `inited`). O primeiro evento emitido é sempre um **Full Snapshot** do DOM atual.

O SDK valida antes de iniciar: requer que o `Rum.init()` (otel-web) tenha sido chamado antes — precisa do `resource.attributes['rum.sessionId']`.

```typescript
// Verifica se o sampler vai ignorar essa sessão
const span = tracer.startSpan('record init');
if (!span.isRecording()) return;  // sessão descartada pelo sampler
span.end();
```

### Estados possíveis

```
           init()
             │
             ▼
         [ gravando ] ◄──── resume()
             │
           stop()
             │
             ▼
          [ pausado ]
             │
           deinit()
             │
             ▼
          [ finalizado ]
```

### `stop()` — pausa a gravação

```typescript
stop(): void {
  paused = true;   // emit() passa a descartar todos os eventos
}
```

O rrweb continua chamando `emit()` internamente, mas o callback descarta tudo:
```typescript
emit(srcEvent) {
  if (paused) return;  // descarte silencioso
  ...
}
```

### `resume()` — retoma a gravação

```typescript
resume(): void {
  paused = false;
  record.takeFullSnapshot();  // novo keyframe obrigatório ao retomar
  tracer.startSpan('record resume').end();
}
```

Um **Full Snapshot** é obrigatório ao retomar porque o DOM pode ter mudado durante a pausa.

### `deinit()` — para completamente

```typescript
deinit(): void {
  inited();   // chama a função de cleanup do rrweb
  inited = false;
}
```

---

## 4. Gerenciamento de sessão

### Session ID

O `rum.sessionId` vem do resource do TracerProvider (gerenciado pelo `otel-web`). O session-recorder lê via `resource.attributes['rum.sessionId']` e monitora mudanças.

### Detecção de troca de sessão

A sessão pode renovar automaticamente (após inatividade do usuário). O `emit()` detecta isso comparando com o último ID conhecido:

```typescript
emit(srcEvent) {
  if (paused) return;

  // Detecta troca de sessão
  if (resource.attributes['rum.sessionId'] !== lastKnownSession) {
    if (document.hidden) {
      return;  // página em background → não continua
    }
    // Página visível → nova sessão, reinicia contadores
    lastKnownSession = resource.attributes['rum.sessionId'];
    sessionStartTime = Date.now();
    eventCounter = 1;
    logCounter = 1;
    record.takeFullSnapshot();  // novo keyframe para a nova sessão
  }
  ...
}
```

### Quando um Full Snapshot é tirado

| Situação | Como |
|----------|------|
| Início da gravação | Automático pelo rrweb ao chamar `record()` |
| Troca de sessão | `record.takeFullSnapshot()` explícito |
| Resume após stop | `record.takeFullSnapshot()` explícito |
| Nó com rate-limit atingido | `record.takeFullSnapshot()` após 1s de debounce |

---

## 5. Proteções e limites

### Limite de duração

```typescript
const MAX_RECORDING_LENGTH = (4 * 60 + 1) * 60 * 1000;  // 4h01min em ms

// Em emit():
if (srcEvent.timestamp > sessionStartTime + MAX_RECORDING_LENGTH) {
  return;  // descarta silenciosamente
}
```

### MutationRateLimiter — token bucket por nó DOM

**Arquivo:** `packages/session-recorder/src/sessionrecording-utils.ts`

Animações CSS intensas ou componentes que mutam o DOM muito rapidamente podem gerar centenas de eventos por segundo. O `MutationRateLimiter` usa o algoritmo **token bucket** para limitar por nó:

```typescript
class MutationRateLimiter {
  private bucketSize = 100;   // máximo de tokens por nó
  private refillRate = 10;    // tokens reabastecidos por segundo

  // Reabastece todos os buckets a cada 1s
  constructor(...) {
    setInterval(() => this.refillBuckets(), 1000);
  }
}
```

**Funcionamento:**
- Cada nó DOM tem seu próprio bucket (identificado pelo ID interno do rrweb)
- A cada mutação de atributo: consome 1 token do bucket do nó
- Quando bucket chega a 0: a mutação é descartada
- Buckets são reabastecidos em +10 tokens por segundo
- SVGs: rate limit aplicado ao SVG pai inteiro, não ao elemento filho

**Quando o bucket esgota:**

```typescript
options.onBlockedNode = (id, node) => {
  // 1. Emite span de warning com a mensagem
  const span = tracer.startSpan('console.warn', { kind: SpanKind.INTERNAL });
  span.setAttribute('component', 'console');
  span.setAttribute('level', 'warn');
  span.setAttribute('message', `Rate limiting... node ${id}`);
  span.end(now);

  // 2. Agenda full snapshot após 1s para capturar estado final
  clearTimeout(queuedFullSnapshotTimeout);
  queuedFullSnapshotTimeout = setTimeout(() => {
    record.takeFullSnapshot();
  }, 1000);
};
```

Eventos que **não** passam pelo rate limiter (só atributos são throttled):
- Nós adicionados/removidos (`adds`, `removes`)
- Mudanças de texto (`texts`)
- Scroll, input, mouse — nunca são throttled

### Limite de tamanho de mensagem

```typescript
const MAX_MESSAGE_SIZE = 5_000_000;  // ~5MB antes de compressão

function ensureStringifiedMaxMessageSize(stringifiedData: string): string {
  if (stringifiedData.length > MAX_MESSAGE_SIZE) {
    // Substitui data URIs de imagem por um placeholder SVG
    // Remove outros data URIs completamente
    const dataURIRegex = /data:([\w/\-.]+);(\w+),([^)"]*)/gim;
    for (const match of matches) {
      if (match[1].startsWith('image/')) {
        stringifiedData = stringifiedData.replace(match[0], replacementImageURI);
      } else {
        stringifiedData = stringifiedData.replace(match[0], '');
      }
    }
  }
  return stringifiedData;
}
```

Casos comuns que explodem o tamanho: `<canvas>` com `recordCanvas: true`, imagens inline em `src` de `<img>` como base64.

---

## 6. Serialização e chunking

### Fluxo de um evento

```typescript
emit(srcEvent) {
  // 1. Rate limiting (apenas para mutations)
  const event = mutationRateLimiter.throttleMutations(srcEvent) ?? srcEvent;

  // 2. Serialização JSON → Uint8Array
  const body = encoder.encode(
    ensureStringifiedMaxMessageSize(JSON.stringify(event))
  );

  // 3. Cálculo de chunks
  const MAX_CHUNK_SIZE = 950 * 1024;  // ~950KB
  const totalC = Math.ceil(body.byteLength / MAX_CHUNK_SIZE);

  // 4. Fatiamento e envio de cada chunk
  for (let i = 0; i < totalC; i++) {
    const start = i * MAX_CHUNK_SIZE;
    const end = (i + 1) * MAX_CHUNK_SIZE;

    const log = convert(decoder.decode(body.slice(start, end)), event.timestamp, {
      'rr-web.offset': logCounter++,       // sequencial global da sessão
      'rr-web.event': eventCounter,         // ID do evento (igual em todos os chunks)
      'rr-web.chunk': i + 1,               // 1-indexed
      'rr-web.total-chunks': totalC,       // total de chunks deste evento
    });

    processor.onLog(log);
  }
  eventCounter++;
}
```

### Atributos dos LogRecords

| Atributo | Tipo | Significado |
|----------|------|-------------|
| `rr-web.offset` | número | Counter sequencial global. Garante ordenação mesmo se logs chegarem fora de ordem no ClickHouse |
| `rr-web.event` | número | ID do evento rrweb. Igual em todos os chunks do mesmo evento — serve para remontar |
| `rr-web.chunk` | número | Posição do chunk (começa em 1) |
| `rr-web.total-chunks` | número | Total de chunks deste evento. Se `== 1`, evento não foi fatiado |

**Por que `~950KB` e não `1MB`?** Folga para os metadados OTLP e headers HTTP ficarem abaixo do limite de 1MB de muitos proxies e load balancers.

### BatchLogProcessor

**Arquivo:** `packages/session-recorder/src/BatchLogProcessor.ts`

```typescript
class BatchLogProcessor {
  scheduledDelayMillis = 5000;  // flush automático a cada 5s

  onLog(log: Log): void {
    this.logs.push(log);
    if (this.timeout === undefined) {
      this.timeout = setTimeout(() => {
        this._flushAll();
      }, this.scheduledDelayMillis);
    }
  }
}
```

Além do timer de 5s, o flush é forçado nos eventos de saída da página (registrados pelo OTLPLogExporter):
- `visibilitychange` (página vai para hidden)
- `pagehide`

---

## 7. Exportação via OTLP

**Arquivo:** `packages/session-recorder/src/OTLPLogExporter.ts`

### Estrutura OTLP Logs

```
LogsData
└── ResourceLogs[]
    ├── Resource
    │   └── Attributes
    │       ├── service.name          ← applicationName do Rum.init()
    │       ├── rum.sessionId         ← ID da sessão atual (getter dinâmico)
    │       ├── telemetry.sdk.name    ← '@hyperdx/otel-web'
    │       └── ...
    └── ScopeLogs[]
        ├── Scope { name: 'rum.rr-web', version }
        └── LogRecords[]
            ├── body        ← JSON string do evento RRWeb (ou chunk)
            ├── timeUnixNano ← event.timestamp * 1_000_000
            └── attributes
                ├── rr-web.offset
                ├── rr-web.event
                ├── rr-web.chunk
                └── rr-web.total-chunks
```

### Encoding e transporte

```typescript
// Serializa em Protocol Buffers
const logsData = constructLogData(logs);
const buffer = LogsData.encode(logsData).finish();

// Comprime com gzip
const compressed = gzipSync(buffer);  // via fflate

// Envia via fetch
fetch(this.config.beaconUrl, {
  method: 'POST',
  body: compressed,
  headers: {
    'Content-Type': 'application/x-protobuf',
    'Content-Encoding': 'gzip',
    'Authorization': apiKey,
  },
});
```

**Endpoint padrão:** `https://in-otel.hyperdx.io/v1/logs`

---

## 8. Replay no app

**Arquivo:** `otel/hyperdx/packages/app/src/DOMPlayer.tsx`

### Carregamento dos eventos (streaming)

Os eventos são carregados via streaming do ClickHouse — não espera carregar tudo para começar:

```typescript
useRRWebEventStream({
  sessionId,
  onEvent: (event: { b: string; ck: number; tcks: number }) => {
    // Remonta chunks
    currentRrwebEvent += event.b;           // concatena o body do chunk
    if (!event.ck || event.ck === event.tcks) {  // chunk final?
      const parsedEvent = JSON.parse(currentRrwebEvent);

      if (replayer.current != null) {
        replayer.current.addEvent(parsedEvent);  // streaming para replayer ativo
      } else {
        initialEvents.current.push(parsedEvent); // acumula até ter >= 2 eventos
      }
      currentRrwebEvent = '';  // reseta buffer de chunks
    }
  },
});
```

### Criação do Replayer

O Replayer é criado assim que há pelo menos **2 eventos** carregados:

```typescript
useEffect(() => {
  if (initialEvents.current.length < 2 || replayer.current != null) return;

  replayer.current = new Replayer(initialEvents.current, {
    root: playerContainer.current,  // <div class="player rr-block">
    mouseTail: true,                // rastro do mouse
    pauseAnimation: false,
    skipInactive: true,             // pula períodos de inatividade
  });

  replayer.current.enableInteract();
}, [isInitialEventsLoaded]);
```

O Replayer do rrweb cria internamente um **`<iframe>` sandboxed** dentro do `root`. O DOM reconstruído fica inteiramente dentro desse iframe — isolado do DOM do app.

### Escalonamento para caber na tela

O iframe replica as dimensões originais da tela do usuário (ex: 1920×1080). Para caber no painel do app, é aplicado um CSS `transform: scale()`:

```typescript
// handleResize()
const playerWidth = replayer?.current?.iframe?.offsetWidth ?? 1280;
const playerHeight = replayer?.current?.iframe?.offsetHeight ?? 720;

const xScale = wrapperRect.width / playerWidth;
const yScale = wrapperRect.height / playerHeight;

// Mantém proporção (fit) sem distorcer
playerContainer.current.style.transform = `scale(${Math.min(xScale, yScale)})`;
```

O resize é chamado a cada:
- `window.resize`
- Evento de resize do viewport gravado (`type=3, data.source=4`)
- Evento de meta page (`type=4`) — nova página carregada

### Controle de playback

```typescript
// Reproduz a partir da posição atual
replayer.current.play(getPlayerCurrentTime(replayer));

// Pausa em offset relativo (ms desde início da sessão)
replayer.current.pause(offsetMs);

// Pula para um timestamp absoluto
replayer.current.pause(focus.ts - replayer.current.getMetaData().startTime);
//                     ↑ absoluto UNIX ms    ↑ timestamp do 1º evento = base zero

// Velocidade e skip de inatividade
replayer.current.setConfig({ speed: 2, skipInactive: true });
```

---

## 9. Sincronização temporal com traces

O ponto de ancoragem temporal é `replayer.getMetaData().startTime` — o timestamp UNIX em ms do **primeiro evento RRWeb da sessão**.

```
Posição atual no replay (absoluta) = startTime + getCurrentTime()
                                     ↑ fixo         ↑ relativo ao início
```

Esse valor é emitido via `requestAnimationFrame` para o estado `focus.ts` que sincroniza o player com a lista de eventos (spans/erros/logs):

```typescript
// Loop de animação — atualiza a cada frame
const updatePlayerTime = () => {
  if (replayer.current?.service.state.matches('playing')) {
    setPlayerTime(
      Math.round(
        replayer.current.getMetaData().startTime +
        Math.max(replayer.current.getCurrentTime(), 0)
      )
    );
  }
  requestAnimationFrame(updatePlayerTime);
};
```

Os spans de trace têm `startTimeUnixNano` (nanosegundos), convertido para ms na query. A comparação `span.timestamp >= focus.ts` é direta — mesmo domínio temporal.

---

## 10. Diagrama de fluxo completo

```
BROWSER — SDK (session-recorder)
│
├── RumRecorder.init()
│     ├── Valida: otel-web inited? sampler ativo?
│     ├── Cria OTLPLogExporter + BatchLogProcessor
│     ├── Cria MutationRateLimiter (token bucket por nó)
│     └── record({ emit, maskAllInputs, maskTextSelector, ... })
│           └── rrweb registra MutationObserver + event listeners
│
├── Evento ocorre no DOM
│     │
│     └── emit(srcEvent) chamado pelo rrweb
│           │
│           ├── paused?          → descarta
│           ├── sessão mudou?    → takeFullSnapshot(), reset counters
│           ├── > 4h?            → descarta
│           │
│           ├── MutationRateLimiter.throttleMutations()
│           │     └── token bucket: descarta se bucket=0
│           │         └── onBlockedNode → span warning + takeFullSnapshot() após 1s
│           │
│           ├── ensureStringifiedMaxMessageSize()
│           │     └── > 5MB? → substitui/remove data URIs
│           │
│           └── Fatia em chunks de ~950KB
│                 └── convert() → Log { body, timeUnixNano, attributes }
│                       └── BatchLogProcessor.onLog()
│                             └── Acumula por 5s → OTLPLogExporter.export()
│                                   └── Protobuf → gzip → POST /v1/logs
│
└── Página fecha / aba muda
      ├── visibilitychange / pagehide
      └── BatchLogProcessor força flush imediato


CLICKHOUSE — armazenamento
│
└── logs_otel
      ├── ResourceAttributes['rum.sessionId']   ← chave de correlação
      ├── LogAttributes['rr-web.offset']         ← ordem global
      ├── LogAttributes['rr-web.event']          ← agrupa chunks
      ├── LogAttributes['rr-web.chunk']
      ├── LogAttributes['rr-web.total-chunks']
      ├── Body                                    ← JSON do evento rrweb
      └── TimestampTime                           ← timestamp absoluto ms


APP — DOMPlayer (replay)
│
├── useRRWebEventStream (streaming do ClickHouse)
│     ├── Recebe eventos chunk a chunk
│     ├── Concatena chunks pelo rr-web.event
│     └── JSON.parse quando chunk final chega
│
├── initialEvents.length >= 2?
│     └── new Replayer(initialEvents, { root: <div> })
│           └── Cria <iframe> interno
│               └── Aplica Full Snapshot → DOM reconstruído
│
├── Novos eventos chegando → replayer.addEvent() (streaming)
│
├── requestAnimationFrame loop
│     └── setPlayerTime(startTime + getCurrentTime())
│           └── focus.ts → sincroniza SessionEventList + Playbar
│
└── Clique em evento / marker
      └── replayer.pause(focus.ts - startTime)
            └── Pula para ponto exato no replay
```

---

## Referência rápida — limites e configurações

| Parâmetro | Valor | Arquivo |
|-----------|-------|---------|
| Duração máxima | 4h01min | `index.ts:54` |
| Tamanho máximo do chunk | ~950KB | `index.ts:55` |
| Tamanho máximo do evento | ~5MB | `sessionrecording-utils.ts:53` |
| Flush automático (batch) | 5 segundos | `BatchLogProcessor.ts` |
| Token bucket — tamanho | 100 tokens | `sessionrecording-utils.ts:123` |
| Token bucket — reabastecimento | 10 tokens/s | `sessionrecording-utils.ts:124` |
| Mínimo de eventos para criar Replayer | 2 | `DOMPlayer.tsx:343` |
| Mascaramento de inputs | `true` (padrão) | `index.ts:160` |
| Mascaramento de textos | `'*'` (padrão) | `index.ts:161` |
