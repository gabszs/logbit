# UptimeKit — Ciclo de Vida de um Monitor: do Cadastro à Notificação

> Arquivos-chave:
> - `packages/db/src/schema/monitors.ts` — schema do monitor no PostgreSQL
> - `apps/worker/cmd/worker/main.go` — loop principal do worker (Go)
> - `apps/worker/internal/api/client.go` — cliente HTTP do worker
> - `apps/worker/internal/monitor/` — checkers por tipo
> - `apps/dash/src/app/api/worker/heartbeat/route.ts` — endpoint de heartbeat
> - `apps/dash/src/app/api/worker/events/route.ts` — endpoint de ingestão de eventos
> - `apps/dash/src/app/api/worker/cert/[monitorId]/route.ts` — endpoint de cert SSL
> - `packages/api/src/pkg/worker/service.ts` — processamento de eventos
> - `packages/api/src/lib/events.ts` — EventBus
> - `packages/api/src/pkg/integrations/service.ts` — notificações para integrações (Discord, Webhook, etc.)
> - `packages/api/src/pkg/subscribers/service.ts` — notificações para subscribers da status page
> - `packages/scheduler/src/index.ts` — scheduler BullMQ (jobs periódicos)
> - `packages/scheduler/src/jobs/maintenance-processor.ts` — job de manutenção

---

## 1. Cadastrando um Novo Monitor — Dados Armazenados

Quando o usuário cria um monitor pelo dashboard, uma linha é inserida na tabela `monitor` no PostgreSQL via oRPC handler `monitors.create`.

### Schema completo da tabela `monitor`

```typescript
// packages/db/src/schema/monitors.ts
monitor = pgTable("monitor", {
    id:                          text("id").primaryKey(),
    organizationId:              text("organization_id").notNull(),  // multi-tenant
    groupId:                     text("group_id"),                   // agrupamento visual opcional

    name:                        text("name").notNull(),
    type:                        text("type").notNull(),             // "http" | "tcp" | "ping" | "dns" | "http-json" | "keyword"
    active:                      boolean("active").default(true),
    pauseReason:                 text("pause_reason"),               // motivo de pausa manual

    interval:                    integer("interval").default(60),    // segundos entre checks
    timeout:                     integer("timeout").default(30),     // segundos de timeout por check

    // Lógica de abertura de incidentes
    incidentPendingDuration:     integer("incident_pending_duration").default(0), // segundos para confirmar antes de abrir incidente
    incidentRecoveryDuration:    integer("incident_recovery_duration").default(0), // segundos para confirmar recuperação
    publishIncidentToStatusPage: boolean("publish_incident_to_status_page").default(false),

    // Onde o monitor roda
    locations:                   json("locations").$type<string[]>(),  // ex: ["ro", "us"]
    workerIds:                   json("worker_ids").$type<string[]>(), // IDs específicos de workers

    // Configuração específica por tipo (JSON flexível)
    config: json("config"),
    // Para HTTP:   { url, method, headers, body, acceptedStatusCodes, keyword,
    //               jsonPath, expectedValue, checkSsl, sslCertExpiryNotificationDays }
    // Para TCP:    { hostname, port }
    // Para ICMP:   { hostname }
    // Para DNS:    { hostname }

    successStatuses: json("success_statuses").$type<number[]>(),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
})
```

**Nenhuma tarefa agendada é criada no momento do cadastro.** O monitor fica ativo na tabela e será descoberto automaticamente pelo worker no próximo heartbeat.

---

## 2. Como o Worker Funciona — O Tick Loop

O worker é um processo Go independente (`apps/worker/`). Ele **não recebe push do dashboard** — ele puxa ativamente em um loop de ticker.

### 2.1 Configuração do Worker

```go
// apps/worker/internal/config/config.go
Config{
    APIKey:        os.Getenv("WORKER_API_KEY"),    // chave de autenticação
    DashboardURL:  os.Getenv("DASHBOARD_URL"),      // ex: http://localhost:3000
    CheckInterval: os.Getenv("CHECK_INTERVAL"),     // default: 60 segundos
}
```

`CHECK_INTERVAL` é o intervalo **do ticker global do worker** — a frequência com que ele acorda e executa um ciclo. É diferente do `interval` de cada monitor individual (que é enviado pelo dashboard mas **não é respeitado no código atual** — o worker executa todos os monitors em todo tick).

### 2.2 O Loop Principal

```go
// apps/worker/cmd/worker/main.go
func main() {
    // ...inicialização...

    tick(client, registry)  // executa imediatamente ao iniciar

    ticker := time.NewTicker(time.Duration(cfg.CheckInterval) * time.Second)

    for {
        select {
        case <-ctx.Done():
            return  // shutdown
        case <-ticker.C:
            tick(client, registry)  // executa a cada CheckInterval segundos
        }
    }
}
```

### 2.3 O que acontece em cada `tick()`

```
tick()
  │
  ├─ 1. POST /api/worker/heartbeat
  │       Headers: Authorization: Bearer <WORKER_API_KEY>
  │       Body: {}
  │       ← Response: { monitors: [...configs] }
  │
  ├─ 2. Para cada monitor recebido → goroutine paralela
  │       registry.Get(cfg.Type)   // busca o checker correto
  │       m.Check(cfg)             // executa o check
  │       resultsChan <- result    // envia resultado
  │
  ├─ 3. Coleta todos os resultados
  │
  ├─ 4. POST /api/worker/events
  │       Body: { events: [ ...resultados ] }
  │
  └─ 5. Para cada resultado com certificado SSL:
          POST /api/worker/cert/{monitorId}
          Body: { domain, issuer, validFrom, validTo, daysUntilExpiry, isValid }
```

---

## 3. Heartbeat — Dashboard Retorna Quais Monitors Executar

```
POST /api/worker/heartbeat
Authorization: Bearer <api_key>
```

**O dashboard autentica o worker** pelo hash SHA-256 da API key e retorna a lista de monitors ativos atribuídos àquele worker:

```typescript
// apps/dash/src/app/api/worker/heartbeat/route.ts
const monitors = await getMonitorsForWorker(authResult.worker.id);
return NextResponse.json({ monitors });
```

**Lógica de filtragem** (`packages/api/src/pkg/worker/service.ts`):

```typescript
// Busca todos os monitors ativos
const allActiveMonitors = await db.query.monitor.findMany({
    where: (t, { eq }) => eq(t.active, true),
});

// Filtra os que pertencem a este worker
return allActiveMonitors.filter((m) => {
    const workerIds = m.workerIds ?? [];
    if (workerIds.length > 0) {
        return workerIds.includes(workerId);  // prioridade: IDs específicos
    }
    const locations = m.locations ?? [];
    return locations.includes(workerRecord.location);  // fallback: por location
});
```

**Config retornada para cada monitor:**

```typescript
{
    id, type,
    url, hostname, port,
    interval, timeout,
    method, headers, body,
    acceptedStatusCodes, keyword, jsonPath, expectedValue,
    checkSsl, sslCertExpiryNotificationDays
}
```

---

## 4. Execução dos Checks por Tipo

Cada tipo de monitor tem um checker em `apps/worker/internal/monitor/`:

| Tipo | Arquivo | O que faz |
|---|---|---|
| `http` / `https` | `http.go` | GET/POST com `net/http/httptrace`, coleta DNS, TCP, TLS, TTFB, transfer |
| `tcp` | `tcp.go` | Abre conexão TCP em `hostname:port`, mede latência |
| `ping` | `ping.go` | ICMP ping via `hostname` |
| `http-json` | `json.go` | HTTP + extrai campo via JSONPath, compara com expectedValue |
| `keyword` | `keyword.go` | HTTP + busca string no body |

### Exemplo — HTTP Monitor (timings detalhados)

O monitor HTTP usa `httptrace.ClientTrace` para capturar cada fase da requisição:

```go
// apps/worker/internal/monitor/http.go
trace := &httptrace.ClientTrace{
    DNSStart:             func(_) { dnsStart = time.Now() },
    DNSDone:              func(_) { dnsDone = time.Now() },
    ConnectStart:         func(_, _) { connStart = time.Now() },
    ConnectDone:          func(_, _, _) { connDone = time.Now() },
    TLSHandshakeStart:    func() { tlsStart = time.Now() },
    TLSHandshakeDone:     func(state, _) { tlsDone = time.Now(); tlsState = &state },
    GotFirstResponseByte: func() { gotFirstByte = time.Now() },
}
```

**Status code considerado "up":**
- Default: 200–299
- Customizável via `acceptedStatusCodes`: ex `"200-299,301,302"`

**Resultado gerado:**

```go
Result{
    MonitorID:       cfg.ID,
    Status:          "up" | "down",
    Latency:         ms,
    Timings:         { DNSLookup, TCPConnect, TLSHandshake, TTFB, Transfer, Total },
    StatusCode:      200,
    Error:           "HTTP 503 Service Unavailable",
    Timestamp:       time.Now().UTC().RFC3339,
    CertificateInfo: { domain, issuer, validFrom, validTo, daysUntilExpiry, isValid },
}
```

**Retry no cliente HTTP do worker:** 4 tentativas com backoff exponencial (500ms → 1s → 2s → 5s) + jitter 20%, apenas para erros de transporte e status 429/502/503/504.

---

## 5. Ingestão de Eventos — O Dashboard Processa os Resultados

```
POST /api/worker/events
Authorization: Bearer <api_key>
Body: { events: [ ...Result[] ] }
```

O processamento principal acontece em `processMonitorEvents()` ([service.ts](../../otel/uptimekit/packages/api/src/pkg/worker/service.ts)):

### 5.1 Fluxo de processamento

```
processMonitorEvents(events[], workerId)
  │
  ├─ Agrupa eventos por monitorId (Map)
  │
  ├─ Para cada monitor → processMonitorEventGroup()
  │   │
  │   ├─ Busca config do monitor no PostgreSQL
  │   ├─ Verifica manutenção ativa → se sim, força status = "maintenance"
  │   ├─ Busca incidente automático aberto (PostgreSQL)
  │   │
  │   ├─ [ClickHouse] Busca último status por região (ROW_NUMBER PARTITION BY location)
  │   ├─ [ClickHouse] Busca último evento global (ORDER BY timestamp DESC LIMIT 1)
  │   │
  │   └─ Para cada evento (ordenados por timestamp):
  │       ├─ Se status mudou → adiciona em changesToInsert[]
  │       ├─ Atualiza snapshot regional (regionStatusByLocation Map)
  │       │
  │       ├─ TODAS as regiões configuradas estão DOWN?
  │       │   ├─ Calcula tempo desde que todas estão down
  │       │   ├─ Se tempo >= incidentPendingDuration E sem incidente aberto:
  │       │   │   └─ Cria incidente automático → incidentsToInsert[]
  │       │   │       + incidentMonitorsToInsert[]
  │       │   │       + incidentStatusPagesToInsert[] (se publishIncidentToStatusPage)
  │       │   │       + activitiesToInsert[] (log automático)
  │       │   └─ Se incidente aberto E alguma região voltou:
  │       │       ├─ UPDATE incident SET status="resolved"
  │       │       └─ eventBus.emit("incident.resolved", {...})
  │
  ├─ [ClickHouse] INSERT batch → monitor_changes  (apenas mudanças)
  ├─ [PostgreSQL] INSERT batch → incident          (novos incidentes)
  ├─ eventBus.emit("incident.created") para cada novo incidente
  ├─ [PostgreSQL] INSERT batch → incident_monitor
  ├─ [PostgreSQL] INSERT batch → incident_status_page
  ├─ [PostgreSQL] INSERT batch → incident_activity
  └─ [ClickHouse] INSERT batch → monitor_events   (todos os eventos)
```

### 5.2 Lógica de abertura de incidente

Um incidente automático **só é aberto** quando:
1. **Todas** as regiões/workers configurados para aquele monitor reportam `down`
2. O tempo que todas estão down é `>=` `incidentPendingDuration` (em segundos)
3. Não existe um incidente automático já aberto

```typescript
const allRegionsDown =
    allRegionsReporting &&
    configuredRegionStates.every((state) => state.status === "down");

if (allRegionsDown) {
    const allRegionsDownSince = new Date(Math.max(...states.map(s => s.timestamp.getTime())));
    const durationMs = eventTime.getTime() - allRegionsDownSince.getTime();
    const pendingMs = monitorConfig.incidentPendingDuration * 1000;

    if (durationMs >= pendingMs && !activeIncident) {
        // ABRE INCIDENTE
    }
}
```

O incidente é resolvido automaticamente quando **qualquer** região volta (`"up"`) enquanto há incidente aberto.

---

## 6. Notificações — Dois Canais Paralelos

Quando um incidente é criado ou resolvido, dois serviços distintos escutam o EventBus:

```
eventBus.emit("incident.created" | "incident.resolved" | ...)
           │
           ├─────────────────────────────────────────────────────────────────┐
           ▼                                                                 ▼
IntegrationService                                               SubscriberNotificationService
(configurações da org)                                           (subscribers da status page)
```

### 6.1 EventBus — Eventos Disponíveis

```typescript
// packages/api/src/lib/events.ts — TypedEventEmitter (Node.js EventEmitter)
"incident.created"       → { incidentId, organizationId, title, description, severity }
"incident.acknowledged"  → { incidentId, organizationId, title, description, severity, userId }
"incident.resolved"      → { incidentId, organizationId, title, description, severity }
"incident.comment_added" → { incidentId, organizationId, title, message, severity, userId }
"incident.deleted"       → { incidentId, organizationId, title, severity }
"monitor.ssl.expiring"   → { monitorId, organizationId, monitorName, domain, daysUntilExpiry, ... }
```

---

### 6.2 IntegrationService — Notificações para a Organização

Escuta: `incident.created`, `incident.acknowledged`, `incident.resolved`, `incident.comment_added`

```typescript
// packages/api/src/pkg/integrations/service.ts
class IntegrationService {
    private setupListeners() {
        for (const eventName of events) {
            eventBus.on(eventName, async (payload) => {
                // 1. Busca todas as integrations ativas da organização
                const configs = await db.query.integrationConfig.findMany({
                    where: and(eq(t.organizationId, organizationId), eq(t.active, true)),
                });

                // 2. Para cada integration, chama o handler se suporta o evento
                for (const config of configs) {
                    const integration = integrationRegistry.get(config.type);
                    if (integration?.events.includes(event)) {
                        await integration.handler(config.config, event, payload);
                    }
                }
            });
        }
    }
}
```

**Integrações registradas:**

| Tipo | Eventos suportados | O que faz |
|---|---|---|
| `webhook` | created, resolved, acknowledged, comment_added | POST JSON `{ event, payload, timestamp }` para URL configurada + header `X-Webhook-Secret` opcional |
| `discord` | created, resolved, acknowledged, comment_added | POST embed formatado para Discord webhook URL (cor vermelha=down, verde=resolved) |
| `telegram` | (configurável) | Envia mensagem via Telegram bot |
| `alertmanager` | (configurável) | Notifica AlertManager (Prometheus-compatible) |

**Exemplo — Payload Discord para `incident.created`:**

```json
{
  "embeds": [{
    "color": 16711680,
    "description": "> `⛔` New incident created",
    "fields": [
      { "name": "`💻` Monitors", "value": "[`api`](http://localhost:3000/monitors/abc)", "inline": true },
      { "name": "`📅` Date", "value": "<t:1714000000:D>", "inline": true },
      { "name": "`⏰` Time", "value": "<t:1714000000:T>", "inline": true },
      { "name": "`❓` Reason", "value": "```\nMonitor api is down.\n\nError: timeout\n```" }
    ]
  }],
  "components": [{
    "type": 1,
    "components": [{ "type": 2, "style": 5, "label": "Manage Incident", "url": "http://..." }]
  }]
}
```

**Webhook genérico:**

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

---

### 6.3 SubscriberNotificationService — Notificações para Subscribers da Status Page

Escuta: `incident.acknowledged`, `incident.resolved` (não `incident.created`)

```typescript
// packages/api/src/pkg/subscribers/service.ts
private async handleEvent(event, payload) {
    // 1. Busca quais status pages estão publicando este incidente
    const statusPageLinks = await db.select(...)
        .from(incidentStatusPage)
        .where(eq(incidentStatusPage.incidentId, payload.incidentId));

    // 2. Busca todos os subscribers dessas páginas
    const subscribers = await db.select().from(statusPageEmailSubscribers)
        .where(inArray(statusPageEmailSubscribers.statusPageId, statusPageIds));

    // 3. Para cada subscriber, envia via todos os canais que tem configurado
    for (const subscriber of subscribers) {
        if (!page.design.allowSubscriptions) continue;

        await sendSubscriberEmail({ to, subject, text, html });

        if (subscriber.slackWebhookUrl)   await postWebhook(slackUrl,   { text: slackText });
        if (subscriber.discordWebhookUrl) await postWebhook(discordUrl, { embeds: [...] });
    }
}
```

**Canais por subscriber:**
- Email (Resend ou SMTP) — sempre enviado se subscriber tiver email
- Slack webhook — se o subscriber cadastrou `slackWebhookUrl`
- Discord webhook — se o subscriber cadastrou `discordWebhookUrl`

**Por que só `acknowledged` e `resolved` (não `created`)?**  
Subscribers são usuários externos que acompanham a status page — não faz sentido notificá-los no momento da criação do incidente, antes de qualquer confirmação. A notificação vai quando há ação do time (`acknowledged`) ou quando o problema é resolvido (`resolved`).

**Proteção contra SSRF:** todos os webhooks passam por `assertSafeWebhookUrl()` que rejeita URLs locais (localhost, 127.0.0.1, etc.). Timeout de 10s por request de webhook.

---

## 7. Notificação SSL — Fluxo Separado

O worker Go, após cada check HTTP, extrai dados do certificado TLS e envia separadamente:

```
POST /api/worker/cert/{monitorId}
Body: { domain, issuer, validFrom, validTo, daysUntilExpiry, isValid }
```

**Lógica de throttle** para não spammar notificações:

```typescript
// apps/dash/src/app/api/worker/cert/[monitorId]/route.ts
function shouldSendNotification(daysUntilExpiry, lastNotification, threshold) {
    if (daysUntilExpiry < 0)          return true;   // já expirado: sempre notifica
    if (daysUntilExpiry > threshold)  return false;  // dentro do prazo: não notifica

    if (!lastNotification) return true;  // primeira vez: notifica

    const daysSinceLastNotif = lastDays - daysUntilExpiry;

    if (daysUntilExpiry <= 7) return daysSinceLastNotif >= 1;  // urgente: 1x por dia
    return daysSinceLastNotif >= 7;                             // normal: 1x por semana
}
```

Quando deve notificar:
1. Upsert em `ssl_certificate_notification` (PostgreSQL) — registra quando e com quantos dias restantes foi notificado
2. `eventBus.emit("monitor.ssl.expiring", {...})`

O evento `monitor.ssl.expiring` pode ser consumido por integrações que o suportarem, mas **não** dispara o `SubscriberNotificationService` (que só escuta eventos de incidente).

---

## 8. Jobs Periódicos (BullMQ Scheduler)

O processo `packages/scheduler` é separado do dashboard. Ele conecta ao Redis e registra dois jobs no BullMQ:

```typescript
// packages/scheduler/src/index.ts
await schedulerQueue.upsertJobScheduler(
    "maintenance-processor",
    { pattern: "* * * * *" },    // todo minuto
    { name: "maintenance-processor", data: {} }
);

await schedulerQueue.upsertJobScheduler(
    "data-retention",
    { pattern: "0 2 * * *" },    // 02:00 AM diariamente
    { name: "data-retention", data: {} }
);
```

### 8.1 Job: `maintenance-processor` (todo minuto)

Verifica no PostgreSQL se alguma manutenção precisa mudar de status:

```
scheduled → in_progress    quando startAt <= now
in_progress → completed    quando endAt <= now
```

Para cada transição, dentro de uma transaction:
1. `UPDATE maintenance SET status = ...`
2. `INSERT INTO maintenance_update (message: "Maintenance has started automatically.")`

**Efeito colateral no worker:** quando um monitor está em manutenção ativa (`maintenance_monitor` + `maintenance.status = "in_progress"`), o `processMonitorEventGroup` força `event.status = "maintenance"` em todos os eventos desse monitor — evitando abertura de incidentes durante a janela programada.

### 8.2 Job: `data-retention` (02:00 AM)

```typescript
// packages/scheduler/src/jobs/data-retention.ts
const retentionDays = config?.value || "30";  // padrão 30 dias (configurável no dashboard)

await clickhouse.command({
    query: `ALTER TABLE uptimekit.monitor_events DELETE WHERE timestamp < toDateTime64({cutoff:UInt64} / 1000, 3)`,
    query_params: { cutoff: cutoffTimestamp }
});

await clickhouse.command({
    query: `ALTER TABLE uptimekit.monitor_changes DELETE WHERE timestamp < toDateTime64({cutoff:UInt64} / 1000, 3)`,
    query_params: { cutoff: cutoffTimestamp }
});
```

---

## 9. Diagrama Completo — Do Cadastro à Notificação

```
[Usuário cria monitor no dashboard]
  │
  └─ INSERT INTO monitor (PostgreSQL)
      active=true, interval=60, incidentPendingDuration=300, locations=["ro"]

        ↓ próximo tick do worker Go (a cada CHECK_INTERVAL segundos)

[Worker Go: tick()]
  ├─ POST /api/worker/heartbeat → recebe config do monitor
  ├─ goroutine: m.Check(cfg) → Result{ status: "down", latency: 30000, error: "timeout" }
  └─ POST /api/worker/events → { events: [result] }

        ↓ dashboard processa

[processMonitorEvents()]
  ├─ ClickHouse: busca último status por região (tudo UP antes)
  ├─ Detecta mudança: UP → DOWN → insere em changesToInsert[]
  ├─ Verifica: todas as regiões estão DOWN?
  │     ├─ Sim, mas incidentPendingDuration=300s ainda não passou → aguarda
  │     └─ (nos próximos ticks, acumula downtime)
  │
  ├─ [após 300s de todas as regiões down]
  │     ├─ Cria incidente → incidentsToInsert[]
  │     │   { status: "investigating", severity: "major", type: "automatic" }
  │     └─ eventBus.emit("incident.created", {...})
  │
  ├─ INSERT ClickHouse: monitor_changes (mudança UP→DOWN)
  ├─ INSERT PostgreSQL: incident + incident_monitor + incident_activity
  └─ INSERT ClickHouse: monitor_events (evento bruto)

        ↓ EventBus dispara em paralelo

[IntegrationService.handleEvent("incident.created")]
  ├─ busca integrations ativas da org no PostgreSQL
  ├─ Discord webhook → POST embed vermelho ao canal configurado
  ├─ Webhook genérico → POST JSON { event, payload, timestamp }
  └─ Telegram/AlertManager → conforme configurado

[SubscriberNotificationService]
  └─ (não escuta "incident.created" — aguarda acknowledged/resolved)

        ↓ time passes, monitor volta

[Worker: nova rodada de ticks]
  └─ POST /api/worker/events → { status: "up" }

[processMonitorEvents()]
  ├─ Detecta UP com incidente aberto
  ├─ UPDATE incident SET status="resolved", endedAt=now
  └─ eventBus.emit("incident.resolved", {...})

[IntegrationService]
  └─ Discord embed verde, webhooks de "resolved"

[SubscriberNotificationService.handleEvent("incident.resolved")]
  ├─ Busca status pages publicando o incidente
  ├─ Busca subscribers das páginas
  └─ Para cada subscriber:
      ├─ sendSubscriberEmail(html + text)
      ├─ POST slackWebhookUrl (se configurado)
      └─ POST discordWebhookUrl (se configurado)

        ↓ paralelamente, todos os dias às 02:00 AM

[BullMQ: data-retention job]
  └─ ALTER TABLE ClickHouse DELETE WHERE timestamp < (now - 30d)

        ↓ todo minuto

[BullMQ: maintenance-processor job]
  └─ UPDATE maintenance: scheduled→in_progress ou in_progress→completed
      (evita incidentes durante janela de manutenção)
```

---

## 10. Resumo das Responsabilidades por Componente

| Componente | Responsabilidade |
|---|---|
| **Dashboard (Next.js)** | Armazena configuração, processa eventos do worker, detecta incidentes, emite eventos |
| **Worker (Go)** | Executa checks de forma concorrente, envia resultados via HTTP |
| **ClickHouse** | Armazena todos os eventos e mudanças de status |
| **PostgreSQL** | Armazena configuração, incidentes, integrações, subscribers |
| **EventBus** | Desacopla processamento de eventos de notificações |
| **IntegrationService** | Notifica canais configurados pela organização (Discord, Webhook, Telegram) |
| **SubscriberNotificationService** | Notifica usuários finais inscritos nas status pages |
| **BullMQ Scheduler** | Manutenção de estados e limpeza de dados antigos |
| **Redis** | Fila do BullMQ + cache de queries frequentes da status page |
