# Faro Web SDK — Session Management

Repositório analisado: `otel/faro-web-sdk`

---

## Índice

1. [Geração do ID](#1-geração-do-id)
2. [Constantes e TTLs](#2-constantes-e-ttls)
3. [Estrutura de Dados](#3-estrutura-de-dados)
4. [Criação da Sessão](#4-criação-da-sessão)
5. [Validade e Rotação](#5-validade-e-rotação)
6. [Storage: Volatile vs Persistent](#6-storage-volatile-vs-persistent)
7. [Orquestração: SessionInstrumentation](#7-orquestração-sessioninstrumentation)
8. [Fluxo Completo](#8-fluxo-completo)
9. [Comparativo com Nossa Implementação](#9-comparativo-com-nossa-implementação)

---

## 1. Geração do ID

**Arquivo:** `packages/core/src/utils/shortId.ts`

```ts
const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

export function genShortID(length = 10): string {
  return Array.from(Array(length))
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)]!)
    .join('');
}
```

**Detalhes:**
- Tamanho padrão: **10 caracteres**
- Charset: **52 caracteres** — `a-z` sem `l`, `A-Z` sem `I` e `O`, `0-9`
  - `I`, `O`, `l` são excluídos para evitar confusão visual com `1` e `0`
- Algoritmo: `Math.random()` — suficiente para IDs de sessão de telemetria
- Regex aproximado: `^[a-zA-Z0-9]{10}$`
- Exemplo: `jK3mNpQrXy`

O gerador pode ser sobrescrito via config:

```ts
// packages/web-sdk/src/metas/session/createSession.ts
export function createSession(attributes?: MetaSession['attributes']): MetaSession {
  return {
    id: faro.config?.sessionTracking?.generateSessionId?.() ?? genShortID(),
    attributes,
  };
}
```

Se `generateSessionId` estiver definido na config, ele é usado. Caso contrário, `genShortID()`.

---

## 2. Constantes e TTLs

**Arquivo:** `packages/web-sdk/src/instrumentations/session/sessionManager/sessionConstants.ts`

```ts
export const STORAGE_KEY = 'com.grafana.faro.session';
export const SESSION_EXPIRATION_TIME = 4 * 60 * 60 * 1000;  // 4 horas
export const SESSION_INACTIVITY_TIME = 15 * 60 * 1000;       // 15 minutos
export const STORAGE_UPDATE_DELAY = 1 * 1000;                // 1 segundo (throttle)
export const MAX_SESSION_PERSISTENCE_TIME = SESSION_INACTIVITY_TIME; // 15 minutos

export const defaultSessionTrackingConfig: Config['sessionTracking'] = {
  enabled: true,
  persistent: false,  // sessionStorage por padrão
  maxSessionPersistenceTime: MAX_SESSION_PERSISTENCE_TIME,
} as const;
```

| Constante | Valor | Propósito |
|---|---|---|
| `SESSION_EXPIRATION_TIME` | 4h | Lifetime máximo absoluto da sessão |
| `SESSION_INACTIVITY_TIME` | 15min | Expira se o usuário ficou inativo |
| `STORAGE_UPDATE_DELAY` | 1s | Throttle do `updateSession` via `visibilitychange` |
| `MAX_SESSION_PERSISTENCE_TIME` | 15min | Descarta sessão persistida se `lastActivity` for mais antigo que isso |

---

## 3. Estrutura de Dados

**Arquivo:** `packages/web-sdk/src/instrumentations/session/sessionManager/types.ts`

```ts
export interface FaroUserSession {
  sessionId: string;        // ID da sessão atual
  lastActivity: number;     // Timestamp ms da última atividade
  started: number;          // Timestamp ms de criação da sessão
  isSampled: boolean;       // Decisão de sampling
  sessionMeta?: MetaSession; // Metadados com histórico e overrides
}
```

**MetaSession** (do core):
```ts
interface MetaSession {
  id?: string;
  attributes?: {
    previousSession?: string;  // ID da sessão anterior (histórico de rotação)
    isSampled?: string;        // "true" ou "false"
    [key: string]: string;     // Atributos customizados
  };
  overrides?: {
    serviceName?: string;
    geoLocationTrackingEnabled?: boolean;
  };
}
```

O campo `previousSession` nos atributos permite rastrear a cadeia de sessões — quando uma sessão é rotacionada, o ID antigo é preservado na nova sessão.

---

## 4. Criação da Sessão

**Arquivo:** `packages/web-sdk/src/instrumentations/session/sessionManager/sessionManagerUtils.ts`

```ts
export function createUserSessionObject({
  sessionId,
  started,
  lastActivity,
  isSampled = true,
}: CreateUserSessionObjectParams = {}): FaroUserSession {
  const now = dateNow();
  const generateSessionId = faro.config?.sessionTracking?.generateSessionId;

  if (sessionId == null) {
    sessionId = typeof generateSessionId === 'function' ? generateSessionId() : genShortID();
  }

  return {
    sessionId,
    lastActivity: lastActivity ?? now,
    started: started ?? now,
    isSampled,
  };
}
```

Quando uma nova sessão é criada a partir de uma anterior, o ID antigo é preservado em `attributes.previousSession`:

```ts
export function addSessionMetadataToNextSession(
  newSession: FaroUserSession,
  previousSession: FaroUserSession | null
) {
  const sessionWithMeta: Required<FaroUserSession> = {
    ...newSession,
    sessionMeta: {
      id: newSession.sessionId,
      attributes: {
        ...faro.config.sessionTracking?.session?.attributes,
        isSampled: newSession.isSampled.toString(),
      },
    },
  };

  const previousSessionId = previousSession?.sessionId;
  if (previousSessionId != null) {
    sessionWithMeta.sessionMeta.attributes!['previousSession'] = previousSessionId;
  }

  return sessionWithMeta;
}
```

---

## 5. Validade e Rotação

**Arquivo:** `packages/web-sdk/src/instrumentations/session/sessionManager/sessionManagerUtils.ts`

### Verificação de validade

```ts
export function isUserSessionValid(session: FaroUserSession | null): boolean {
  if (session == null) return false;

  const now = dateNow();

  // Verifica lifetime máximo (4h)
  const lifetimeValid = now - session.started < SESSION_EXPIRATION_TIME;
  if (!lifetimeValid) return false;

  // Verifica inatividade (15min)
  const inactivityPeriodValid = now - session.lastActivity < SESSION_INACTIVITY_TIME;
  return inactivityPeriodValid;
}
```

### Updater — decide renovar ou rotacionar

```ts
export function getUserSessionUpdater({ fetchUserSession, storeUserSession }) {
  return function updateSession({ forceSessionExtend } = { forceSessionExtend: false }) {
    const sessionFromStorage = fetchUserSession();

    if (forceSessionExtend === false && isUserSessionValid(sessionFromStorage)) {
      // Sessão válida: só atualiza lastActivity
      storeUserSession({ ...sessionFromStorage!, lastActivity: dateNow() });
    } else {
      // Sessão expirada ou forçada: gera novo ID, preserva histórico
      const newSession = addSessionMetadataToNextSession(
        createUserSessionObject({ isSampled: isSampled() }),
        sessionFromStorage
      );

      storeUserSession(newSession);
      faro.api?.setSession(newSession.sessionMeta);
      sessionTrackingConfig?.onSessionChange?.(
        sessionFromStorage?.sessionMeta ?? null,
        newSession.sessionMeta!
      );
    }
  };
}
```

### Cenários de rotação

| Cenário | Condição | Novo ID | `previousSession` salvo |
|---|---|---|---|
| Inatividade | `lastActivity` > 15min atrás | ✅ | ✅ |
| Lifetime expirado | `started` > 4h atrás | ✅ | ✅ |
| Servidor invalida | Header `X-Faro-Session-Status: invalid` | ✅ | ✅ |
| Chamada manual | `faro.api.setSession({ id: newId })` | ✅ | ✅ |

---

## 6. Storage: Volatile vs Persistent

### VolatileSessionsManager — `sessionStorage`

**Arquivo:** `packages/web-sdk/src/instrumentations/session/sessionManager/VolatileSessionManager.ts`

```ts
export class VolatileSessionsManager {
  private static storageTypeSession = webStorageType.session; // sessionStorage

  static storeUserSession(session: FaroUserSession): void {
    setItem(STORAGE_KEY, stringifyExternalJson(session), VolatileSessionsManager.storageTypeSession);
  }

  static fetchUserSession(): FaroUserSession | null {
    const storedSession = getItem(STORAGE_KEY, VolatileSessionsManager.storageTypeSession);
    return storedSession ? JSON.parse(storedSession) : null;
  }

  // Throttle de 1s para não fazer update excessivo
  updateSession = throttle(() => this.updateUserSession(), STORAGE_UPDATE_DELAY);

  private init(): void {
    // Quando a aba volta ao foco, verifica se a sessão ainda é válida
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateSession();
      }
    });

    // Sincroniza com mudanças externas via faro.api.setSession()
    faro.metas.addListener(
      getSessionMetaUpdateHandler({
        fetchUserSession: VolatileSessionsManager.fetchUserSession,
        storeUserSession: VolatileSessionsManager.storeUserSession,
      })
    );
  }
}
```

**Comportamento:** Sessão morre ao fechar a aba. Cada aba tem sua própria sessão independente.

### PersistentSessionsManager — `localStorage`

**Arquivo:** `packages/web-sdk/src/instrumentations/session/sessionManager/PersistentSessionsManager.ts`

Estruturalmente idêntico ao `VolatileSessionsManager`, apenas muda o storage type:

```ts
export class PersistentSessionsManager {
  private static storageTypeLocal = webStorageType.local; // localStorage
  // ... mesma lógica
}
```

**Comportamento:** Sessão persiste entre abas e reloads. Habilitado via `sessionTracking.persistent: true`.

Ao inicializar, sessões persistidas com `lastActivity` mais antigo que `maxSessionPersistenceTime` (15min padrão) são descartadas:

```ts
// packages/web-sdk/src/instrumentations/session/instrumentation.ts
if (sessionsConfig.persistent && storedUserSession) {
  const shouldClearPersistentSession =
    storedUserSession.lastActivity < now - sessionsConfig.maxSessionPersistenceTime;

  if (shouldClearPersistentSession) {
    PersistentSessionsManager.removeUserSession();
    storedUserSession = null;
  }
}
```

---

## 7. Orquestração: SessionInstrumentation

**Arquivo:** `packages/web-sdk/src/instrumentations/session/instrumentation.ts`

### Init — resume ou cria nova sessão

```ts
initialize() {
  const SessionManager = getSessionManagerByConfig(sessionTrackingConfig);

  // Hook beforeSend: atualiza lastActivity a cada sinal enviado
  this.registerBeforeSendHook(SessionManager);

  // Tenta recuperar sessão existente do storage
  const { initialSession, lifecycleType } = this.createInitialSession(SessionManager, sessionTrackingConfig);

  SessionManager.storeUserSession(initialSession);
  this.api.setSession(initialSession.sessionMeta);

  if (lifecycleType === EVENT_SESSION_START)  this.api.pushEvent(EVENT_SESSION_START, {});
  if (lifecycleType === EVENT_SESSION_RESUME) this.api.pushEvent(EVENT_SESSION_RESUME, {});

  // Listener para disparar SESSION_EXTEND quando o ID muda
  this.metas.addListener(this.sendSessionStartEvent.bind(this));
}
```

### beforeSend hook — `lastActivity` atualizado a cada sinal

```ts
private registerBeforeSendHook(SessionManager: SessionManager) {
  const { updateSession } = new SessionManager();

  this.transports?.addBeforeSendHooks((item) => {
    updateSession();  // ← verifica validade e atualiza lastActivity

    const attributes = item.meta.session?.attributes;
    if (attributes?.['isSampled'] === 'true') {
      // Remove isSampled do payload antes de enviar
      const newItem = JSON.parse(JSON.stringify(item));
      delete newItem.meta.session?.attributes?.['isSampled'];
      return newItem;
    }

    return null; // sinal descartado (não sampled)
  });
}
```

### Eventos de ciclo de vida

| Evento | Quando |
|---|---|
| `EVENT_SESSION_START` | Nova sessão criada (primeira vez ou após expiração) |
| `EVENT_SESSION_RESUME` | Sessão existente válida recuperada do storage |
| `EVENT_SESSION_EXTEND` | Sessão rotacionada por inatividade/expiração |

---

## 8. Fluxo Completo

```
Inicialização do SDK
  └── storage tem FaroUserSession?
        ├── SIM e válida (lifetime < 4h, lastActivity < 15min)
        │     └── EVENT_SESSION_RESUME, reutiliza sessionId
        └── NÃO ou expirada
              └── genShortID() → novo sessionId
                  └── EVENT_SESSION_START

Cada sinal enviado (trace, log, metric, event)
  └── beforeSend hook → updateSession()
        ├── sessão válida → atualiza lastActivity no storage
        └── expirou → novo sessionId, previousSession = oldId
                      → onSessionChange() callback
                      → EVENT_SESSION_EXTEND

visibilitychange (aba volta ao foco)
  └── updateSession() throttled (1s)
        └── mesma lógica acima

faro.api.setSession({ id: newId })
  └── setSessionMetaUpdateHandler detecta mudança
        └── cria nova FaroUserSession com o ID fornecido
            └── atualiza storage
```

---

## 9. Comparativo com Nossa Implementação

| Aspecto | Faro Web SDK | Nossa implementação (otel.ts) |
|---|---|---|
| Geração | `genShortID()` — 52 chars, 10 chars | — (não implementado ainda) |
| Storage padrão | `sessionStorage` | — |
| Storage opcional | `localStorage` | — |
| TTL inatividade | 15 minutos | — |
| TTL lifetime | 4 horas | — |
| Rotação automática | ✅ | — |
| `previousSession` | ✅ | — |
| Propagação | Span attribute `session.id` via SpanProcessor | Resource attribute (proposta) |
| `lastActivity` update | A cada sinal enviado (beforeSend hook) | — |
| `visibilitychange` | Verifica expiração ao voltar ao foco | — |
| `onSessionChange` callback | ✅ | — |
| Sampling por sessão | ✅ | — |

### Decisão de propagação

O Faro adiciona `session.id` como **span attribute** via `FaroMetaAttributesSpanProcessor`, não como Resource attribute. A razão: o session ID pode mudar durante a vida da página (rotação por inatividade). Se estivesse no Resource, ficaria travado no valor do momento da inicialização.

Para logs e métricas, o session ID é propagado via `faro.metas.value.session.id` — cada sinal lê o valor atual do meta no momento do envio.
