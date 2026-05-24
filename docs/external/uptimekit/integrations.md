# UptimeKit — Sistema de Integrações: Registry, Definições e Como Adicionar Novas

> Arquivos-chave:
> - `packages/api/src/pkg/integrations/registry.ts` — Registry + interface `IntegrationDefinition`
> - `packages/api/src/pkg/integrations/service.ts` — `IntegrationService` (listener do EventBus)
> - `packages/api/src/pkg/integrations/definitions/` — uma integration por arquivo
> - `packages/api/src/routers/integrations.ts` — API CRUD de configurações
> - `packages/db/src/schema/integrations.ts` — schema PostgreSQL
> - `apps/dash/src/app/api/webhooks/integrations/[integrationId]/route.ts` — receiver de webhooks externos

---

## 1. Dois Tipos de Integração

O sistema distingue dois fluxos fundamentalmente diferentes:

| Tipo | `type` | Direção | Quando dispara |
|---|---|---|---|
| **Export** | `"export"` | UptimeKit → serviço externo | Ao receber evento do EventBus (ex: incidente criado) |
| **Import** | `"import"` | Serviço externo → UptimeKit | Ao receber webhook externo (ex: AlertManager firing) |

---

## 2. O Contrato — `IntegrationDefinition<Config>`

Toda integração implementa esta interface:

```typescript
// packages/api/src/pkg/integrations/registry.ts
interface IntegrationDefinition<Config = unknown> {
    id:          string;             // identificador único: "discord", "webhook", "telegram"
    name:        string;             // nome legível: "Discord"
    type:        "export" | "import";
    logo?:       string;             // caminho da imagem: "/integrations/discord.png"
    description: string;
    configSchema: z.ZodSchema<Config>; // schema Zod validando o JSON de config salvo no banco
    events:      string[];           // quais eventos do EventBus esta integration escuta
    handler:     (config: Config, event: string, payload: unknown) => Promise<void>;
}
```

**Por que `configSchema` é Zod?**  
O JSON de configuração é salvo na coluna `config jsonb` do PostgreSQL sem type safety no banco. O Zod valida e tipifica no momento em que o usuário salva (`configure`) e quando o handler executa.

### Padrão meta + handler separados

Cada integração usa dois arquivos:

```
definitions/
  discord-meta.ts   ← id, name, type, configSchema, events  (sem handler)
  discord.ts        ← spread do meta + implementação do handler
```

Isso permite importar os metadados (para listar integrações disponíveis no frontend) sem carregar toda a lógica do handler.

---

## 3. O Registry — Singleton de Integrações

```typescript
// packages/api/src/pkg/integrations/registry.ts
class IntegrationRegistry {
    private integrations = new Map<string, IntegrationDefinition<any>>();

    register(integration) { this.integrations.set(integration.id, integration); }
    get(id: string)       { return this.integrations.get(id); }
    list()                { return Array.from(this.integrations.values()); }
}

export const integrationRegistry = new IntegrationRegistry();
```

O registro ocorre na inicialização do `IntegrationService`:

```typescript
// packages/api/src/pkg/integrations/service.ts
integrationRegistry.register(webhookIntegration);
integrationRegistry.register(discordIntegration);
integrationRegistry.register(telegramIntegration);
integrationRegistry.register(alertManagerIntegration);
```

---

## 4. Integrações Built-in

### 4.1 Webhook Genérico (`export`)

```typescript
// ConfigSchema
{ url: z.url(), secret: z.string().optional() }

// Eventos: created, resolved, acknowledged, comment_added
// (não tem integration.test)
```

**Payload enviado:**
```json
{
  "event": "incident.created",
  "payload": {
    "incidentId": "...",
    "organizationId": "...",
    "title": "Monitor api is down",
    "severity": "major"
  },
  "timestamp": "2026-04-15T10:00:00.000Z"
}
```

**Header opcional:** `X-Webhook-Secret: <secret>` se configurado.  
**Proteção SSRF:** URL é validada por `assertSafeWebhookUrl()` antes de salvar e antes de enviar.

---

### 4.2 Discord (`export`)

```typescript
// ConfigSchema
{
  webhookUrl: z.string().url().refine(
    url => url.startsWith("https://discord.com/api/webhooks/") ||
           url.startsWith("https://canary.discord.com/api/webhooks/") ||
           url.startsWith("https://ptb.discord.com/api/webhooks/")
  )
}

// Eventos: created, resolved, acknowledged, comment_added, integration.test
```

**Comportamento por evento:**

| Evento | Cor | Emoji header |
|---|---|---|
| `incident.created` | Vermelho `#FF0000` | `⛔ New incident created` |
| `incident.resolved` | Verde `#00FF00` | `✅ Incident resolved` |
| `incident.acknowledged` | Amarelo `#FFFF00` | `👀 Incident acknowledged` |
| `incident.comment_added` | Azul `#3498DB` | `💬 New comment` |
| `integration.test` | Azul `#3498DB` | `🧪 Integration test` |

O handler busca os monitors afetados no PostgreSQL para incluir links no embed. Inclui botão "Manage Incident" (link Discord component `type: 2, style: 5`).

---

### 4.3 Telegram (`export`)

```typescript
// ConfigSchema
{ botToken: z.string().min(1), chatId: z.string().min(1) }

// Eventos: created, resolved, acknowledged, comment_added, integration.test
```

Envia via `https://api.telegram.org/bot{token}/sendMessage` com `parse_mode: "HTML"`. Formato de texto simples com tags `<b>`, `<pre>`, `<a>`.

---

### 4.4 Prometheus AlertManager (`import`)

```typescript
// ConfigSchema
{
  bearerToken:     z.string().min(1),
  autoResolve:     z.boolean().default(true),
  defaultSeverity: z.enum(["minor", "major", "critical"]).default("major"),
  titleTemplate:   z.string().default("Alert: {{alertname}}")
}

// events: []  ← não escuta EventBus, recebe webhook externo
```

É a única integração `type: "import"`. Não usa o handler do EventBus — opera no sentido inverso: **recebe** alertas do AlertManager e **cria** incidentes no UptimeKit.

**Mapeamento de severity:**

| AlertManager severity label | UptimeKit severity |
|---|---|
| `critical` | `critical` |
| `warning` | `major` |
| `info` | `minor` |
| (qualquer outro) | `config.defaultSeverity` |

**`titleTemplate`** suporta interpolação de labels do alert:
```
"Alert: {{alertname}} on {{instance}}"
→ "Alert: HighCPU on server-1"
```

**Deduplicação:** usa `alert.fingerprint` como `externalId`. Alertas `firing` já existentes (com `endedAt = null`) são ignorados.  
**Auto-resolve:** se `autoResolve = true`, alertas `resolved` encerram o incidente e emitem `incident.resolved` no EventBus.

---

## 5. Como as Integrações Export São Disparadas

```
EventBus.emit("incident.created", payload)
    │
    └─ IntegrationService.handleEvent("incident.created", payload)
        │
        ├─ db: SELECT * FROM integration_config
        │       WHERE organizationId = payload.organizationId AND active = true
        │
        └─ Para cada config:
            integration = integrationRegistry.get(config.type)
            if (integration.events.includes("incident.created"))
                await integration.handler(config.config, event, payload)
```

**Erros são silenciados** — `try/catch` sem rethrow. Uma integration falhando não afeta as outras nem interrompe o fluxo de processamento de eventos.

---

## 6. Como a Integração Import (AlertManager) Recebe Webhooks

```
POST /api/webhooks/integrations/{integrationId}
Authorization: Bearer <bearerToken>
Body: AlertManager webhook payload
```

```typescript
// apps/dash/src/app/api/webhooks/integrations/[integrationId]/route.ts

// 1. Busca config no banco por integrationId
// 2. Verifica se active = true
// 3. Valida bearerToken com timingSafeEqual (proteção timing attack)
// 4. Valida payload com AlertManagerPayloadSchema (Zod)
// 5. processAlertManagerWebhook(config, organizationId, payload)
//    → cria ou resolve incidentes + emite eventos no EventBus
```

**Resposta de sucesso:**
```json
{ "success": true, "created": 2, "resolved": 1, "skipped": 0 }
```

---

## 7. Schema no Banco — `integration_config`

```sql
CREATE TABLE integration_config (
    id              text PRIMARY KEY,
    organizationId  text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    type            text NOT NULL,                    -- "discord", "webhook", "telegram", "alertmanager"
    config          jsonb NOT NULL,                   -- JSON validado pelo configSchema da integration
    active          boolean DEFAULT true NOT NULL,
    createdAt       timestamp DEFAULT now() NOT NULL,
    updatedAt       timestamp NOT NULL
);

INDEX integration_config_org_idx  ON (organizationId)
INDEX integration_config_type_idx ON (type)
```

**Uma linha por tipo por organização** — a lógica de upsert no `configure` handler garante isso:

```typescript
const existing = await db.query.integrationConfig.findFirst({
    where: and(eq(t.organizationId, orgId), eq(t.type, input.type))
});

if (existing) { UPDATE ... } else { INSERT ... }
```

---

## 8. API CRUD das Integrações

Todos os endpoints requerem `writeProcedure` (sessão ativa + role `admin`/`owner`).

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/integrations/available` | Lista integrações registradas no registry (protectedProcedure) |
| `GET` | `/integrations/configured` | Lista configs salvas da organização |
| `POST` | `/integrations/configure` | Cria ou atualiza config (upsert por type) |
| `DELETE` | `/integrations/{id}` | Remove config |
| `POST` | `/integrations/{id}/toggle` | Ativa/desativa sem deletar |
| `POST` | `/integrations/{id}/test` | Dispara `integration.test` no handler |

**Validação no `configure`:**
1. Verifica se o `type` existe no registry
2. Executa `configSchema.parse(input.config)` — erro Zod vira HTTP 400
3. Para webhooks, valida URL contra SSRF antes de salvar

**Evento de teste** (`test`):
```typescript
const testPayload = {
    organizationId,
    incidentId: "test-incident-id",
    title: "Test Incident",
    description: "This is a test incident...",
    severity: "info",
    status: "investigating",
    createdAt: new Date().toISOString(),
};
await integration.handler(config.config, "integration.test", testPayload);
```

Discord e Telegram tratam `integration.test` com uma mensagem especial. Webhook genérico **não** lista `integration.test` nos seus eventos — não recebe o teste.

---

## 9. Como Adicionar uma Nova Integração

### Passo 1 — Definir o meta (schema + eventos)

```typescript
// packages/api/src/pkg/integrations/definitions/slack-meta.ts
import { z } from "zod";
import type { IntegrationDefinition } from "../registry";

export const SlackConfigSchema = z.object({
    webhookUrl: z.string().url().refine(
        url => url.startsWith("https://hooks.slack.com/services/"),
        { message: "Must be a valid Slack Webhook URL" }
    ),
});

export const slackIntegrationMeta: Omit<IntegrationDefinition<z.infer<typeof SlackConfigSchema>>, "handler"> = {
    id: "slack",
    name: "Slack",
    type: "export",
    logo: "/integrations/slack.png",
    description: "Get notified in your Slack workspace when incidents occur.",
    configSchema: SlackConfigSchema,
    events: [
        "incident.created",
        "incident.resolved",
        "incident.acknowledged",
        "incident.comment_added",
        "integration.test",
    ],
};
```

### Passo 2 — Implementar o handler

```typescript
// packages/api/src/pkg/integrations/definitions/slack.ts
import type { z } from "zod";
import type { IntegrationDefinition } from "../registry";
import { SlackConfigSchema, slackIntegrationMeta } from "./slack-meta";

export const slackIntegration: IntegrationDefinition<z.infer<typeof SlackConfigSchema>> = {
    ...slackIntegrationMeta,
    handler: async (config, event, payload: any) => {
        let text = "";

        switch (event) {
            case "incident.created":
                text = `:red_circle: *Incident created:* ${payload.title}`;
                break;
            case "incident.resolved":
                text = `:large_green_circle: *Incident resolved:* ${payload.title}`;
                break;
            case "integration.test":
                text = `:white_check_mark: Integration test successful!`;
                break;
            default:
                text = `Event: ${event} — ${payload.title}`;
        }

        await fetch(config.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
    },
};
```

### Passo 3 — Registrar no service

```typescript
// packages/api/src/pkg/integrations/service.ts
import { slackIntegration } from "./definitions/slack";

integrationRegistry.register(slackIntegration);  // adicionar esta linha
```

**É tudo.** O CRUD da API, a listagem no frontend e o disparo por eventos funcionam automaticamente para qualquer integration registrada.

---

## 10. Diagrama Geral

```
                    ┌─────────────────────────────────────────┐
                    │          IntegrationRegistry             │
                    │  Map<id, IntegrationDefinition>         │
                    │  ─────────────────────────────          │
                    │  "webhook"      → webhookIntegration    │
                    │  "discord"      → discordIntegration    │
                    │  "telegram"     → telegramIntegration   │
                    │  "alertmanager" → alertManagerIntegration│
                    └───────────────────┬─────────────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────┐
              │                         │                      │
              ▼                         ▼                      ▼
   CRUD API (oRPC)            IntegrationService         Webhook receiver
   /integrations/*            (EventBus listener)        /api/webhooks/
                                                         integrations/{id}
   configure → valida         on("incident.*")           (apenas alertmanager)
   configSchema.parse()        │
   → upsert no banco           └─ busca configs ativas
                                  → handler(config, event, payload)

        ┌───────────────────────────────────────────────┐
        │              PostgreSQL: integration_config    │
        │  id | organizationId | type | config | active │
        │  --   acme-org-id      discord  {webhookUrl}    │
        │  --   acme-org-id      webhook  {url, secret}   │
        └───────────────────────────────────────────────┘
```

---

## 11. Pontos de Atenção

1. **Uma config por tipo por organização** — a lógica de upsert impede múltiplos Discord webhooks para a mesma org. Para múltiplos destinos, seria necessário mudar o índice único.

2. **Erros são silenciados no `IntegrationService`** — um Discord timeout não retorna erro para o usuário. Não há retry nem dead-letter queue. Em produção, logs ficam nos logs do servidor.

3. **Handler de `import` é noop** — `alertManagerIntegration.handler` é uma função vazia. A lógica real fica em `processAlertManagerWebhook`, chamada diretamente pela rota de webhook. O registry registra a integration apenas para fins de CRUD (listar, salvar config).

4. **Webhook receiver hardcoded para AlertManager** — o `switch (config.type)` na rota `/api/webhooks/integrations/[integrationId]` só trata `"alertmanager"`. Para adicionar outra integration de tipo `import`, é necessário adicionar um novo `case` nessa rota — não é automático como as `export`.

5. **Sem fila** — todos os handlers são chamados em série dentro do `for` loop do `IntegrationService`. Com muitas integrações configuradas, o processamento de um evento pode demorar proporcionalmente.
