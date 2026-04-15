# UptimeKit — Worker API Key Auth: Geração, Armazenamento, Validação e Ciclo de Vida

> Arquivos-chave:
> - `packages/api/src/pkg/worker/auth.ts` — SHA-256 hash, cache em memória, `authenticateWorker()`
> - `packages/api/src/routers/workers.ts` — geração da chave, CRUD, rotação, `generateApiKey()`
> - `packages/db/src/schema/workers.ts` — tabelas `worker` e `worker_api_key`
> - `apps/dash/src/app/api/worker/` — rotas protegidas (heartbeat, events, cert)
> - `apps/worker/internal/api/client.go` — cliente Go que envia o header `Authorization`
> - `apps/worker/internal/config/config.go` — `WORKER_API_KEY` env var

---

## 1. Contexto: Por Que um Sistema de Auth Próprio?

O worker (Go) é um processo externo autônomo. Ele precisa:
1. Buscar a lista de monitors que deve checar
2. Enviar os resultados das checagens
3. Enviar informações de certificado SSL

Essas três operações precisam de autenticação. O sistema **não usa** o Better Auth nem JWTs — ele tem um mecanismo dedicado baseado em **SHA-256 + chave opaca**, projetado para ser simples, auditável e revogável.

---

## 2. Formato da Chave

```typescript
// packages/api/src/routers/workers.ts
function generateApiKey(): string {
    const prefix = "uk_"; // UptimeKit prefix
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `${prefix}${key}`;
}
```

| Parte | Conteúdo | Tamanho |
|---|---|---|
| Prefixo | `uk_` | 3 chars |
| Payload | 32 bytes aleatórios → hex lowercase | 64 chars |
| **Total** | | **67 chars** |

Exemplo: `uk_a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1`

O prefixo `uk_` facilita identificação visual em logs, variáveis de ambiente e interfaces de usuário.

---

## 3. Hash e Armazenamento

A chave **nunca é armazenada em texto puro** no banco. Somente o hash SHA-256 é persistido:

```typescript
// packages/api/src/pkg/worker/auth.ts
async function hashApiKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

Output: string hexadecimal de 64 chars (256 bits).

### Schema — `worker_api_key`

```typescript
// packages/db/src/schema/workers.ts
export const workerApiKey = pgTable(
    "worker_api_key",
    {
        id:         text("id").primaryKey(),
        keyHash:    text("key_hash").notNull().unique(),   // SHA-256 da chave, constraint UNIQUE
        keyHint:    text("key_hint").notNull(),            // primeiros 11 chars: "uk_abc1234..."
        workerId:   text("worker_id").notNull()
                        .references(() => worker.id, { onDelete: "cascade" }),
        createdAt:  timestamp("created_at").defaultNow().notNull(),
        lastUsedAt: timestamp("last_used_at"),             // atualizado a cada autenticação
    },
    (table) => [
        index("worker_api_key_hash_idx").on(table.keyHash),
        index("worker_api_key_worker_id_idx").on(table.workerId),
    ],
);
```

### Schema — `worker`

```typescript
export const worker = pgTable(
    "worker",
    {
        id:            text("id").primaryKey(),
        name:          text("name").notNull(),
        location:      text("location").notNull(),  // código de região: "ro", "dk"
        active:        boolean("active").default(true).notNull(),
        lastHeartbeat: timestamp("last_heartbeat"),
        version:       text("version"),
        createdAt:     timestamp("created_at").defaultNow().notNull(),
        updatedAt:     timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
    },
    (table) => [
        index("worker_location_idx").on(table.location),
        index("worker_active_idx").on(table.active),
    ],
);
```

**Cascade delete**: remover um `worker` deleta automaticamente todos os seus registros `worker_api_key`.

---

## 4. Criação de Worker e Chave (oRPC)

```typescript
// packages/api/src/routers/workers.ts — procedure "create"
const rawKey = generateApiKey();
const keyHash = await hashApiKey(rawKey);
const keyHint = `${rawKey.substring(0, 11)}...`;  // "uk_abc1234..."

// Insere worker
const [newWorker] = await db.insert(worker).values({
    id: crypto.randomUUID(),
    name: input.name,
    location: input.location,
    active: true,
}).returning();

// Insere chave (apenas hash)
await db.insert(workerApiKey).values({
    id: crypto.randomUUID(),
    keyHash,
    keyHint,
    workerId: newWorker.id,
});

return { worker: newWorker, key: rawKey }; // rawKey retornado apenas uma vez
```

**A chave raw é retornada exatamente uma vez** — na resposta desta chamada. Não há endpoint para recuperá-la depois. Se perdida, é necessário rotacionar.

O `keyHint` (`uk_abc1234...`) serve para que o usuário identifique qual chave está configurada no worker sem expor o valor completo.

---

## 5. O Worker Go — Como Envia a Chave

### Configuração

```go
// apps/worker/internal/config/config.go
type Config struct {
    APIKey        string  // lido de WORKER_API_KEY
    DashboardURL  string
    CheckInterval int
}

var ErrMissingAPIKey = errors.New("missing WORKER_API_KEY environment variable")

func (c *Config) Validate() error {
    if c.APIKey == "" {
        return ErrMissingAPIKey
    }
    return nil
}
```

### Envio no Header

```go
// apps/worker/internal/api/client.go
req.Header.Set("Authorization", "Bearer "+c.apiKey)
req.Header.Set("Content-Type", "application/json")
```

O worker usa o esquema padrão HTTP `Bearer`. A chave raw é enviada como texto no header — a proteção é feita pelo TLS em produção.

### Retry

O cliente Go faz até **4 tentativas** com backoff exponencial (500ms base, máximo 5s, 20% jitter) para erros de rede e códigos 429, 502, 503, 504.

---

## 6. Validação no Dashboard — `authenticateWorker()`

```typescript
// packages/api/src/pkg/worker/auth.ts
export async function authenticateWorker(
    request: Request,
): Promise<WorkerContext | { error: string; status: number }> {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        return { error: "Missing or invalid Authorization header", status: 401 };
    }

    const token = authHeader.split(" ")[1];
    const now = Date.now();
    const keyHash = await hashApiKey(token);

    // 1. Verifica cache negativo (chaves inválidas)
    const invalidExpiry = invalidKeyCache.get(keyHash);
    if (invalidExpiry && invalidExpiry > now) {
        return { error: "Invalid API Key", status: 401 };
    }

    // 2. Verifica cache positivo (workers autenticados)
    const cached = apiKeyCache.get(keyHash);
    if (cached && cached.expiresAt > now) {
        updateHeartbeatAsync(cached.workerContext.worker.id); // não bloqueia
        return cached.workerContext;
    }

    // 3. Cache miss — consulta banco
    const keyRecord = await db.query.workerApiKey.findFirst({
        where: (t, { eq }) => eq(t.keyHash, keyHash),
        with: { worker: true },
    });

    if (!keyRecord?.worker || !keyRecord.worker.active) {
        invalidKeyCache.set(keyHash, now + INVALID_CACHE_TTL_MS); // penaliza por 10s
        return { error: "Invalid API Key", status: 401 };
    }

    // 4. Autentica — popula cache positivo
    const result: WorkerContext = {
        worker: {
            id: keyRecord.worker.id,
            name: keyRecord.worker.name,
            location: keyRecord.worker.location,
            active: keyRecord.worker.active,
        },
    };
    apiKeyCache.set(keyHash, { workerContext: result, expiresAt: now + CACHE_TTL_MS });

    // 5. Atualiza lastUsedAt + lastHeartbeat em paralelo
    await Promise.all([
        db.update(worker).set({ lastHeartbeat: new Date() }).where(eq(worker.id, keyRecord.worker.id)),
        db.update(workerApiKey).set({ lastUsedAt: new Date() }).where(eq(workerApiKey.id, keyRecord.id)),
    ]);

    return result;
}
```

---

## 7. Cache em Memória

O `authenticateWorker` mantém dois `Map` em memória no processo Node.js:

```typescript
// Cache positivo — workers autenticados com sucesso
const apiKeyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;       // 60 segundos

// Cache negativo — chaves inválidas (rejeição rápida)
const invalidKeyCache = new Map<string, number>();
const INVALID_CACHE_TTL_MS = 10 * 1000; // 10 segundos

// Limpeza periódica de entradas expiradas
setInterval(cleanupCache, 30 * 1000);
```

| Cache | TTL | Propósito |
|---|---|---|
| Positivo (`apiKeyCache`) | 60s | Evita consulta ao banco a cada request do worker |
| Negativo (`invalidKeyCache`) | 10s | Reduz impacto de tentativas com chaves inválidas |

**Implicação de segurança**: após rotacionar uma chave, o worker com a chave antiga ainda pode ser autenticado por até **60 segundos** (enquanto o cache positivo não expirar). A invalidação explícita do cache (`invalidateApiKeyCache`) resolve isso imediatamente.

### Heartbeat no Cache Hit

Quando há cache hit, o heartbeat é atualizado de forma **assíncrona e não-bloqueante**:

```typescript
function updateHeartbeatAsync(workerId: string) {
    db.update(worker)
        .set({ lastHeartbeat: new Date() })
        .where(eq(worker.id, workerId))
        .catch((err) => logger.error("Failed to update heartbeat:", err));
}
```

O request do worker retorna imediatamente sem esperar o UPDATE do banco.

---

## 8. Rotas Protegidas

Todas as rotas de worker ficam em `apps/dash/src/app/api/worker/` e seguem o mesmo padrão:

```typescript
const authResult = await authenticateWorker(request);
if (isAuthError(authResult)) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
}
// authResult agora é WorkerContext com { worker: { id, name, location, active } }
```

| Rota | Método | Propósito |
|---|---|---|
| `/api/worker/heartbeat` | `POST` | Worker envia heartbeat, recebe lista de monitors a checar |
| `/api/worker/events` | `POST` | Worker envia resultados das checagens (`MonitorEvent[]`) |
| `/api/worker/cert/[monitorId]` | `POST` | Worker envia dados de certificado SSL |

**`/api/worker/heartbeat` response:**
```json
{
  "monitors": [
    {
      "id": "monitor-uuid",
      "type": "http",
      "url": "https://example.com",
      "interval": 60,
      "timeout": 30,
      "method": "GET",
      "acceptedStatusCodes": "200-299",
      "checkSsl": true,
      "sslCertExpiryNotificationDays": 30
    }
  ]
}
```

O `processMonitorEvents` no endpoint de eventos usa o `authResult.worker.id` para associar os eventos ao worker correto — impedindo que um worker injete eventos de outro.

---

## 9. Rotação de Chave

```typescript
// packages/api/src/routers/workers.ts — procedure "rotateKey"

// 1. Busca hashes das chaves antigas (para invalidar o cache)
const oldKeys = await db.select({ keyHash: workerApiKey.keyHash })
    .from(workerApiKey)
    .where(eq(workerApiKey.workerId, input.id));

// 2. Gera nova chave
const rawKey = generateApiKey();
const keyHash = await hashApiKey(rawKey);
const keyHint = `${rawKey.substring(0, 11)}...`;

// 3. Deleta chaves antigas, insere nova
await db.delete(workerApiKey).where(eq(workerApiKey.workerId, input.id));
await db.insert(workerApiKey).values({ id: crypto.randomUUID(), keyHash, keyHint, workerId: input.id });

// 4. Invalida cache imediatamente
for (const oldKey of oldKeys) {
    invalidateApiKeyCache(oldKey.keyHash);
}

return { key: rawKey };
```

Após `invalidateApiKeyCache`, a chave antiga é removida do cache positivo e marcada no cache negativo (ou simplesmente removida de ambos). O próximo request do worker com a chave antiga vai ao banco, não a encontra, e retorna 401.

### `invalidateApiKeyCache`

```typescript
export function invalidateApiKeyCache(keyHash?: string) {
    if (keyHash) {
        apiKeyCache.delete(keyHash);
        invalidKeyCache.delete(keyHash);
    } else {
        apiKeyCache.clear();   // limpa todo o cache
        invalidKeyCache.clear();
    }
}
```

---

## 10. Controle de Acesso (oRPC)

Todos os endpoints de gerenciamento de workers exigem:
1. Sessão ativa (`protectedProcedure`)
2. Role `admin` no sistema (verificação manual dentro do handler)

```typescript
if (context.session.user.role !== "admin") {
    throw new ORPCError("UNAUTHORIZED");
}
```

Não há role de organização aqui — é um controle global de instância. Workers são recursos compartilhados por toda a plataforma, não por organização.

---

## 11. Ciclo de Vida Completo

```
CRIAÇÃO
────────
Admin → oRPC "workers.create"
    generateApiKey()           → uk_<64 hex>
    hashApiKey(rawKey)         → SHA-256 (64 hex)
    keyHint = rawKey[0..11]    → "uk_abc1234..."
    INSERT worker              → id, name, location, active=true
    INSERT worker_api_key      → keyHash, keyHint, workerId
    return { worker, key: rawKey }   ← última vez que o raw é visto

USO
────
Worker:
    WORKER_API_KEY=uk_... (env var)
    GET /api/worker/heartbeat
        Authorization: Bearer uk_...
    ← monitors[]

    loop cada CHECK_INTERVAL:
        checar monitors
        POST /api/worker/events    { events: [...] }
        POST /api/worker/cert/:id  { domain, daysUntilExpiry, ... }

Dashboard (a cada request):
    hashApiKey(token)          → keyHash
    check invalidKeyCache      → 401 se hit
    check apiKeyCache          → WorkerContext se hit (60s TTL)
    SELECT FROM worker_api_key WHERE keyHash = ?
    check worker.active
    cache result (60s)
    UPDATE lastUsedAt + lastHeartbeat (async no hit de cache)

ROTAÇÃO
────────
Admin → oRPC "workers.rotateKey"
    SELECT keyHash das chaves antigas
    generateApiKey() + hashApiKey()
    DELETE worker_api_key WHERE workerId = ?
    INSERT nova worker_api_key
    invalidateApiKeyCache(oldKeyHash) ← efeito imediato
    return { key: newRawKey }

DESATIVAÇÃO
────────────
Admin → oRPC "workers.update" com active=false
    UPDATE worker SET active=false
    → próximo request: worker ativo? não → 401

DELEÇÃO
────────
Admin → oRPC "workers.delete"
    SELECT keyHash de todas as chaves
    DELETE worker_api_key WHERE workerId = ?  (ou cascade)
    DELETE worker WHERE id = ?
    invalidateApiKeyCache(keyHash) para cada chave
    → worker não consegue mais autenticar
```

---

## 12. Pontos de Atenção

1. **Cache de 60s não é instantâneo** — Desativar um worker no banco demora até 60s para refletir em requests em andamento. `invalidateApiKeyCache()` é chamado explicitamente na deleção/rotação, mas não na simples desativação (`active=false`). Uma desativação de emergência pode exigir restart do processo Node para limpar o cache.

2. **SHA-256 sem salt** — A chave é hashada sem salt. Isso é aceitável porque a chave contém 32 bytes de entropia (256 bits), tornando rainbow tables impraticáveis. Mas significa que se dois workers tiverem a mesma chave por coincidência (impossível na prática), os hashes seriam iguais — a constraint `UNIQUE` no banco impede o segundo registro.

3. **Sem rate limiting dedicado nas rotas de worker** — As rotas `/api/worker/*` não têm rate limiting. A proteção vem do cache negativo (10s para chaves inválidas) e do custo de hashing (SHA-256 via `crypto.subtle`). Em produção, rate limiting por IP no proxy reverso é recomendado.

4. **Um worker, múltiplas chaves possíveis** — O schema permite múltiplos `worker_api_key` por `workerId` (não há constraint de unicidade em `workerId`). Na prática, a rotação deleta todas as chaves antigas e cria uma nova. Mas um admin poderia, teoricamente, criar múltiplas chaves manualmente via SQL.

5. **`keyHint` não tem verificação de unicidade** — Dois workers poderiam ter o mesmo `keyHint` se os primeiros 11 caracteres coincidissem. É apenas para exibição visual, não para identificação.
