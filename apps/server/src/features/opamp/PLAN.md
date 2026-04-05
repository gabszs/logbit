# OpAMP Server Implementation Plan

## Context

Implementar o servidor OpAMP completo em `apps/server`, usando a rota base existente (`POST /v1/opamp`).
O objetivo é que o usuário possa gerenciar coletores OTel: ver o estado atual (health, effective config, capabilities) e empurrar remote configs — um "OTel manager" com banco de dados, diferente do opamp-go que é só em memória.

Não será implementado: WebSocket, autenticação no endpoint OpAMP.

---

## Arquivos Críticos

| Arquivo | Ação |
|---|---|
| `src/db/models/opampAgents.ts` | Reescrever do zero |
| `src/db/models/index.ts` | Adicionar export de `opampAgents` |
| `src/features/opamp/types.ts` | Criar |
| `src/features/opamp/utils.ts` | Criar |
| `src/features/opamp/queries.ts` | Criar |
| `src/features/opamp/mutations.ts` | Criar |
| `src/features/opamp/handlers.ts` | Criar |
| `src/features/opamp/routes.ts` | Atualizar (chamar handler) |

---

## 1. DB Schema — `src/db/models/opampAgents.ts`

Reescrever completamente. Regras:
- `userId` nullable (agente registra antes de associação ao user)
- `instanceUid` é a chave real — unique, hex-encoded (32 chars, sem dashes)
- `sequenceNum` e `capabilities` como `text` (são `bigint` uint64 do proto — não cabe em PG bigint signed seguro via Drizzle)
- Sub-messages (`agentDescription`, `health`, `effectiveConfig`, `remoteConfigStatus`) como `jsonb` — armazenar output do `toJson()`
- **Exceção binária**: `lastRemoteConfigHash` (do agente) e `desiredConfigHash` (do servidor) como `text` hex — são os campos de comparação de hash
- `desiredConfig` como `jsonb` — o `AgentRemoteConfig` que o servidor quer enviar (set pela management API)
- Campos extras: `name`, `id` (uuid7), `createdAt`, `updatedAt`, `lastSeen`
- **Sem** unique em `userId` — múltiplos agentes por user

```typescript
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { users } from "./authModels"

export const opampAgents = pgTable("opamp_agents", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }), // nullable
  instanceUid: text("instance_uid").notNull().unique(), // hex 32 chars
  name: text("name"),
  sequenceNum: text("sequence_num").notNull().default("0"),
  capabilities: text("capabilities").notNull().default("0"),
  agentDescription: jsonb("agent_description"),        // toJson(AgentDescriptionSchema, ...)
  health: jsonb("health"),                              // toJson(ComponentHealthSchema, ...)
  effectiveConfig: jsonb("effective_config"),           // toJson(EffectiveConfigSchema, ...)
  remoteConfigStatus: jsonb("remote_config_status"),    // toJson(RemoteConfigStatusSchema, ...)
  lastRemoteConfigHash: text("last_remote_config_hash"), // hex — do agente, para comparação
  desiredConfig: jsonb("desired_config"),               // toJson(AgentRemoteConfigSchema, ...) set pela management API
  desiredConfigHash: text("desired_config_hash"),       // hex SHA-256 — do servidor, para comparação
  lastSeen: timestamp("last_seen").notNull().$defaultFn(() => new Date()),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => [
  index("opamp_agents_instance_uid_idx").on(table.instanceUid),
  index("opamp_agents_user_id_idx").on(table.userId),
])
```

---

## 2. `src/db/models/index.ts`

Adicionar import/export de `opampAgents` (o arquivo atual **não** importa opampAgents):

```typescript
import { opampAgents } from "./opampAgents"
// export * from "./opampAgents"
// models: { ...authModels, userSettings, opampAgents }
```

---

## 3. `src/features/opamp/types.ts`

```typescript
import type { JsonValue } from "@bufbuild/protobuf"

export type OpampAgentRow = {
  id: string
  userId: string | null
  instanceUid: string        // hex 32 chars
  name: string | null
  sequenceNum: string        // decimal bigint string
  capabilities: string       // decimal bigint string
  agentDescription: JsonValue | null
  health: JsonValue | null
  effectiveConfig: JsonValue | null
  remoteConfigStatus: JsonValue | null
  lastRemoteConfigHash: string | null  // hex
  desiredConfig: JsonValue | null
  desiredConfigHash: string | null     // hex
  lastSeen: Date
  createdAt: Date
  updatedAt: Date
}

export type UpsertAgentPayload = {
  instanceUid: string
  sequenceNum: string
  capabilities: string
  agentDescription: JsonValue | null
  health: JsonValue | null
  effectiveConfig: JsonValue | null
  remoteConfigStatus: JsonValue | null
  lastRemoteConfigHash: string | null
}

export type SetDesiredConfigPayload = {
  instanceUid: string
  desiredConfig: JsonValue
  desiredConfigHash: string  // hex SHA-256 do toBinary(AgentRemoteConfigSchema, config)
}
```

---

## 4. `src/features/opamp/utils.ts`

Funções puras:

```typescript
// encodeUid(Uint8Array) → hex string (32 chars)
// bytesToHex(Uint8Array) → hex string (qualquer tamanho)
// calcConfigHash(Uint8Array) → Promise<string>  ← SHA-256 via crypto.subtle, retorna hex
// hasAgentCapability(capabilities: bigint, cap: AgentCapabilities) → boolean
```

`calcConfigHash` recebe o `toBinary(AgentRemoteConfigSchema, config)` e retorna hex do SHA-256.
`encodeUid` e `bytesToHex` usam `Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('')`.

---

## 5. `src/features/opamp/queries.ts`

```typescript
// findAgentByInstanceUid(db, instanceUidHex: string) → Promise<OpampAgentRow | null>
//   SELECT * FROM opamp_agents WHERE instance_uid = $1 LIMIT 1

// listAgentsByUserId(db, userId: string) → Promise<OpampAgentRow[]>
//   SELECT * FROM opamp_agents WHERE user_id = $1
```

---

## 6. `src/features/opamp/mutations.ts`

```typescript
// upsertAgent(db, payload: UpsertAgentPayload) → Promise<void>
//   INSERT INTO opamp_agents (...) ON CONFLICT (instance_uid) DO UPDATE SET
//     sequenceNum, capabilities, agentDescription, health,
//     effectiveConfig, remoteConfigStatus, lastRemoteConfigHash,
//     lastSeen, updatedAt
//   NÃO sobrescreve: desiredConfig, desiredConfigHash, userId, name

// setAgentDesiredConfig(db, payload: SetDesiredConfigPayload) → Promise<void>
//   UPDATE opamp_agents SET desired_config, desired_config_hash, updated_at
//   WHERE instance_uid = $1
```

---

## 7. `src/features/opamp/handlers.ts` — Lógica central

Função: `processAgentMessage(db, msg: AgentToServer): Promise<ServerToAgent>`

### Fluxo completo:

**1. Encode instanceUid**
```typescript
const instanceUidHex = encodeUid(msg.instanceUid)
```

**2. Buscar agente existente**
```typescript
const existing = await findAgentByInstanceUid(db, instanceUidHex)
```

**3. Sequence gap detection**
```typescript
const prevSeqNum = existing ? BigInt(existing.sequenceNum) : -1n
const isSequenceGap = msg.sequenceNum !== prevSeqNum + 1n
// sequenceNum=0 no primeiro contato é válido: 0n === -1n + 1n = 0n ✓
```

**4. Compressed status detection**
```typescript
const isCompressed = msg.agentDescription === undefined &&
  msg.health === undefined &&
  msg.effectiveConfig === undefined &&
  msg.remoteConfigStatus === undefined
const needsFullState = existing === null && isCompressed
```

**5. Flag ReportFullState**
```typescript
let flags = 0n
if (isSequenceGap || needsFullState) {
  flags |= BigInt(ServerToAgentFlags.ServerToAgentFlags_ReportFullState)
}
```

**6. Converter campos para JSON**
```typescript
const agentDescriptionJson = msg.agentDescription
  ? toJson(AgentDescriptionSchema, msg.agentDescription) : null
const healthJson = msg.health
  ? toJson(ComponentHealthSchema, msg.health) : null
const effectiveConfigJson = msg.effectiveConfig
  ? toJson(EffectiveConfigSchema, msg.effectiveConfig) : null
const remoteConfigStatusJson = msg.remoteConfigStatus
  ? toJson(RemoteConfigStatusSchema, msg.remoteConfigStatus) : null

// Hash do agente: extrair do binário ANTES do toJson
const lastRemoteConfigHashHex = msg.remoteConfigStatus?.lastRemoteConfigHash?.length
  ? bytesToHex(msg.remoteConfigStatus.lastRemoteConfigHash)
  : null
```

**7. Upsert no banco**
```typescript
await upsertAgent(db, {
  instanceUid: instanceUidHex,
  sequenceNum: msg.sequenceNum.toString(),
  capabilities: msg.capabilities.toString(),
  agentDescription: agentDescriptionJson,
  health: healthJson,
  effectiveConfig: effectiveConfigJson,
  remoteConfigStatus: remoteConfigStatusJson,
  lastRemoteConfigHash: lastRemoteConfigHashHex,
})
```

**8. Comparação de hash — decide se envia remote config**
```typescript
const shouldSendConfig =
  hasAgentCapability(msg.capabilities, AgentCapabilities.AgentCapabilities_AcceptsRemoteConfig) &&
  existing?.desiredConfig != null &&
  existing?.desiredConfigHash != null &&
  existing.desiredConfigHash !== lastRemoteConfigHashHex
  // só envia se o agente ainda não aplicou a config desejada
```

**9. Reconstruir AgentRemoteConfig do JSON**
```typescript
// fromJson disponível em @bufbuild/protobuf
const remoteConfig = shouldSendConfig
  ? fromJson(AgentRemoteConfigSchema, existing!.desiredConfig)
  : undefined
```

**10. Retornar ServerToAgent**
```typescript
const SERVER_CAPABILITIES =
  BigInt(ServerCapabilities.ServerCapabilities_AcceptsStatus) |
  BigInt(ServerCapabilities.ServerCapabilities_OffersRemoteConfig) |
  BigInt(ServerCapabilities.ServerCapabilities_AcceptsEffectiveConfig)

return create(ServerToAgentSchema, {
  instanceUid: msg.instanceUid,
  flags,
  capabilities: SERVER_CAPABILITIES,
  ...(remoteConfig && { remoteConfig }),
})
```

---

## 8. `src/features/opamp/routes.ts` — Atualização

Remover lógica inline. Delegar para handler:

```typescript
import { db } from "../../db"
import { processAgentMessage } from "./handlers"
// ...
async (c) => {
  const buffer = await c.req.arrayBuffer()
  const agentToServer = fromBinary(AgentToServerSchema, new Uint8Array(buffer))
  const response = await processAgentMessage(db, agentToServer)
  return c.body(toBinary(ServerToAgentSchema, response), "application/x-protobuf")
}
```

---

## Migração

```bash
bun db:generate   # gera 0003_opamp_agents.sql
bun db:migrate
```

O arquivo atual tem erro de sintaxe (`enum` como identificador) — tabela provavelmente não existe no banco. O `generate` cria do zero.

---

## Verificação

1. `bun dev:server` — subir o servidor
2. Rodar collector local com `collector/config.yaml` (aponta para `localhost:5151/v1/opamp`)
3. `SELECT * FROM opamp_agents` — deve ter 1 linha por collector conectado
4. Testar `ReportFullState`: reiniciar servidor → próxima mensagem do agente trigga o flag
5. Testar remote config: inserir `desired_config` + `desired_config_hash` diretamente no banco → verificar que collector aplica na próxima mensagem
