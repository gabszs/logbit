# Uptime Kuma — Scheduling, Execução e Persistência

> Baseado no código em `/otel/uptime-kuma/server/`
> Arquivos principais: `model/monitor.js`, `model/heartbeat.js`, `uptime-calculator.js`, `jobs/clear-old-data.js`

---

## Visão geral do fluxo

```
Monitor ativado
  └─► beat() chamado imediatamente
        ├─► executa o check (HTTP, Ping, TCP, etc.)
        ├─► calcula status (UP / DOWN / PENDING / MAINTENANCE)
        ├─► R.store(bean) → INSERT individual na tabela heartbeat
        ├─► atualiza stat_minutely / stat_hourly / stat_daily
        ├─► emite evento WebSocket para o dashboard
        ├─► atualiza métricas Prometheus
        └─► agenda o próximo beat com setTimeout
              └─► (repete indefinidamente)
```

---

## 1. Como o scheduler funciona

### Biblioteca de scheduling

Uptime Kuma usa **Croner** apenas para jobs de background (ex.: limpeza de dados às 3h14). Para os checks de monitor, o mecanismo é **`setTimeout` nativo do Node.js** — sem cron expression, sem interval fixo.

### Ciclo de vida do monitor

**Arquivo:** `server/model/monitor.js` — método `start(io)`

```
monitor.start(io)
  ├─► define beat() [a função de check]
  ├─► define safeBeat() [wrapper com try/catch]
  └─► chama safeBeat() imediatamente (ou com delay para push-type)
```

```
safeBeat()
  └─► beat()
        ├─► executa o check
        ├─► persiste o heartbeat
        └─► calcula intervalRemainingMs e agenda:
              this.heartbeatInterval = setTimeout(safeBeat, intervalRemainingMs)
```

### Compensação de tempo de execução

O intervalo **não é fixo** — ele desconta o tempo que o check levou para rodar:

```javascript
// monitor.js
intervalRemainingMs = Math.max(1,
  beatInterval * 1000 - dayjs().diff(dayjs.utc(bean.time))
)
```

Se o monitor tem `interval = 60s` e o check levou 3s, o próximo beat será agendado para daqui a 57s. Isso mantém o ritmo consistente mesmo com checks lentos.

### Parada do monitor

```javascript
// monitor.js — método stop()
clearTimeout(this.heartbeatInterval)
this.isStop = true
```

Após `isStop = true`, o loop não agenda mais beats.

---

## 2. Fluxo completo de execução de um check

### Fase 1 — Pré-check (setup do bean)

```javascript
// busca o beat anterior no banco
const previousBeat = await R.findOne("heartbeat",
  "monitor_id = ? ORDER BY time DESC LIMIT 1", [this.id])

// cria o novo bean (heartbeat)
bean.monitor_id = this.id
bean.time       = dayjs.utc().format("YYYY-MM-DD HH:mm:ss.SSS")
bean.status     = DOWN   // pessimista por padrão
bean.downCount  = previousBeat?.downCount ?? 0
bean.retries    = previousBeat?.retries ?? 0
```

### Fase 2 — Execução por tipo de monitor

| Tipo | Mecanismo | Mede ping? |
|------|-----------|-----------|
| HTTP / Keyword / JSON-Query | Axios com AbortSignal | Sim (`dayjs().diff(startTime)`) |
| Ping (ICMP) | Utilitário nativo | Sim (roundtrip time) |
| TCP | Socket connection | Sim |
| DNS | DNS lookup | Sim |
| Docker | Docker API | Sim |
| MQTT | Conexão MQTT | Sim |
| gRPC | Canal gRPC | Sim |
| Push | Verifica tempo desde último push | Não (sem check ativo) |
| Banco de dados (Postgres/MySQL/etc.) | Query de teste | Sim |
| Real Browser | Playwright | Sim (page load) |

**Medição de tempo de resposta (HTTP):**
```javascript
let startTime = dayjs().valueOf()   // timestamp em ms
// ... axios request ...
bean.ping = dayjs().valueOf() - startTime   // ms decorridos
```

### Fase 3 — Lógica de retry

```
check falhou?
  ├─► retries < maxretries
  │     └─► bean.status = PENDING (vai tentar de novo)
  │         bean.retries++
  └─► retries >= maxretries (ou maxretries=0)
        └─► bean.status = DOWN
            bean.retries++   (continua contando)
```

- `maxretries = 0` (padrão): vai direto para DOWN sem PENDING
- `retries` é persistido no heartbeat para auditoria

### Fase 4 — Importância e notificação

Um heartbeat é marcado como `important = true` quando representa uma **mudança de estado relevante**. Isso controla tanto o cache quanto as notificações:

```
Primeiro beat de qualquer monitor → IMPORTANT

UP   → DOWN         → IMPORTANT + notifica
DOWN → UP           → IMPORTANT + notifica
PENDING → DOWN      → IMPORTANT + notifica
MAINTENANCE → DOWN  → IMPORTANT + notifica
MAINTENANCE → UP    → IMPORTANT (sem notificação)
DOWN → DOWN         → NÃO important (mas reenvia se downCount >= resendInterval)
UP   → UP           → NÃO important
```

**Down count (reenvio de notificações):**
```javascript
// se o monitor continua DOWN e resendInterval está configurado:
bean.downCount++
if (bean.downCount >= resendInterval) {
  // reenvia a notificação e reseta o contador
  bean.downCount = 0
}
```

### Fase 5 — Persistência no banco

```javascript
// monitor.js linha ~1099
await R.store(bean)  // INSERT individual via Redbean ORM
```

**Um INSERT por check. Não há batch.**

Após o store:
```javascript
io.to(this.user_id).emit("heartbeat", bean.toJSON())  // WebSocket
this.prometheus?.update(bean, tlsInfo, uptimeData)     // Métricas
```

---

## 3. Schema do banco de dados

### Tabela `heartbeat`

Definida em `db/knex_init_db.js` (linhas 124–148):

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PK | Auto-increment |
| `monitor_id` | INTEGER FK | Referência a `monitor.id` (CASCADE delete/update) |
| `status` | SMALLINT | `0`=DOWN, `1`=UP, `2`=PENDING, `3`=MAINTENANCE |
| `time` | DATETIME | Momento do check (UTC, precisão em ms) |
| `ping` | INTEGER | Tempo de resposta em ms (null se DOWN) |
| `msg` | TEXT | Mensagem de erro ou detalhe do status |
| `important` | BOOLEAN | `true` = mudança de estado relevante |
| `duration` | INTEGER | Duração do outage em segundos (default: 0) |
| `down_count` | INTEGER | Contador para reenvio de notificação (default: 0) |
| `retries` | INTEGER | Número de tentativas (migração 2023-09-29) |
| `end_time` | DATETIME | Fim do período de uptime (migração 2023-08-18) |
| `response` | TEXT | Body da resposta (Brotli + Base64, migração 2025-10-15) |

**Índices:**

```sql
INDEX important
INDEX (monitor_id, time)                    -- monitor_time_index
INDEX (monitor_id)
INDEX (monitor_id, important, time)         -- monitor_important_time_index
```

O índice composto `(monitor_id, important, time)` é o mais usado — permite buscar rapidamente os beats de mudança de estado para um monitor específico em um intervalo de tempo.

### Tabelas de agregação de uptime

Uptime Kuma mantém **três níveis** de agregação temporal além dos heartbeats brutos:

| Tabela | Granularidade | Retenção | Uso |
|--------|--------------|----------|-----|
| `stat_minutely` | 1 minuto | 24 horas | Gráficos recentes |
| `stat_hourly` | 1 hora | 30 dias | Médias mensais |
| `stat_daily` | 1 dia | 365 dias | Tendências anuais |

**Schema das tabelas stat_* (idêntico para as três):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PK | — |
| `monitor_id` | INTEGER FK | Monitor |
| `timestamp` | INTEGER | Unix timestamp do início do período |
| `up` | INTEGER | Contagem de beats UP no período |
| `down` | INTEGER | Contagem de beats DOWN no período |
| `ping` | FLOAT | Ping médio do período |
| `ping_min` | FLOAT | Ping mínimo |
| `ping_max` | FLOAT | Ping máximo |
| `extras` | TEXT | JSON com dados adicionais (ex.: manutenções) |

---

## 4. Cálculo de uptime (`uptime-calculator.js`)

### Fluxo após cada heartbeat

```javascript
// monitor.js, logo após o check
const calc = UptimeCalculator.getUptimeCalculator(this.id)
const result = await calc.update(bean.status, bean.ping)
bean.end_time = result.endTimeDayjs
```

### O que `update()` faz internamente

```
1. Converte status:
   - MAINTENANCE → conta como UP (não penaliza uptime)
   - PENDING     → conta como DOWN

2. Determina as três chaves de tempo:
   - divisionKey = minuto atual (minutely)
   - hourlyKey   = hora atual   (hourly)
   - dailyKey    = dia atual    (daily)

3. Para cada nível:
   a. Busca ou cria o bucket em memória (LimitQueue)
   b. Incrementa up/down counters
   c. Atualiza ping stats (min, max, média ponderada)
   d. Persiste o bucket no banco (INSERT ou UPDATE)

4. Limpa dados antigos inline:
   - stat_minutely > 24h → DELETE
   - stat_hourly   > 30d → DELETE
```

### Fórmula de uptime

```
uptime%  = up_count / (up_count + down_count)
avg_ping = Σ(ping × up_count) / total_up_count
```

### API de consulta

```javascript
calc.get24Hour()   // minutely buckets das últimas 24h
calc.get7Day()     // hourly buckets dos últimos 7 dias
calc.get30Day()    // daily buckets dos últimos 30 dias
calc.get1Year()    // daily buckets do último ano

// Retorno:
{ uptime: 0.9987, avgPing: 142 }
```

---

## 5. Armazenamento do response body

Para monitores HTTP com `saveResponse = true`:

```
response HTTP
  └─► trunca para max 4096 chars (configurável, até 100KB)
       └─► brotliCompress(Buffer.from(data, 'utf8'))
            └─► .toString('base64')
                 └─► salvo em heartbeat.response (TEXT)
```

A descompressão é feita sob demanda:

```javascript
// heartbeat.js
static async decodeResponseValue(response) {
  return brotliDecompress(Buffer.from(response, 'base64')).toString('utf8')
}
```

A compressão é offloadada para o thread pool do libuv (não bloqueia o event loop).

---

## 6. Retenção e limpeza de dados

### Job de limpeza

**Cron:** `14 03 * * *` (todo dia às 3h14 UTC)
**Arquivo:** `server/jobs/clear-old-data.js`

```
clearOldData()
  ├─► lê keepDataPeriodDays (padrão: 365, mínimo: 1)
  ├─► DELETE heartbeat WHERE time < agora - keepDataPeriodDays
  ├─► DELETE stat_daily WHERE timestamp < agora - keepDataPeriodDays
  └─► PRAGMA optimize (SQLite)
```

### Limpeza inline de heartbeats não-importantes

Separada do job principal, roda após cada check importante (`Database.clearHeartbeatData()`):

- **Mantém:** beats com `important = true` + últimos 100 por monitor
- **Remove:** beats não-importantes com mais de 24 horas

Isso mantém a tabela `heartbeat` enxuta — apenas eventos de mudança de estado são preservados a longo prazo.

### Limpeza das tabelas stat

Feita inline no `uptime-calculator.js` durante cada atualização:

```javascript
// Após inserir novo bucket:
DELETE FROM stat_minutely WHERE timestamp < agora - 24h
DELETE FROM stat_hourly   WHERE timestamp < agora - 30d
// stat_daily: limpo apenas pelo job diário
```

---

## 7. Salvamento: individual vs batch

| Operação | Estratégia | Detalhe |
|----------|-----------|---------|
| `heartbeat` INSERT | **Individual** — um por check | `R.store(bean)` |
| `stat_minutely` INSERT/UPDATE | **Um por bucket de tempo** | Reutiliza a linha existente do minuto |
| `stat_hourly` INSERT/UPDATE | **Um por bucket de tempo** | Idem por hora |
| `stat_daily` INSERT/UPDATE | **Um por bucket de tempo** | Idem por dia |
| Limpeza de heartbeats antigos | **Bulk DELETE** | Por range de data |
| Limpeza de stat_minutely/hourly | **Bulk DELETE** | Por range de timestamp |

**Não existe batch insert de heartbeats.** Cada execução de check resulta em exatamente um `INSERT` na tabela `heartbeat`. As tabelas `stat_*` são mais eficientes porque fazem `UPDATE` numa linha existente (o bucket do período atual) em vez de inserir uma nova linha a cada beat.

---

## 8. Concorrência

- Cada monitor roda em seu próprio loop `setTimeout` — completamente independente
- Não há lock global entre monitores
- O banco de dados usa o pool de conexões do Knex (padrão: até 10 conexões simultâneas)
- A tabela `stat_*` usa constraint única por `(monitor_id, timestamp)` para evitar duplicatas em concurrent writes
- O `UptimeCalculator` mantém estado em memória por monitor (instâncias separadas via `Map`)

---

## 9. Diagrama completo

```
┌─────────────────────────────────────────────────────────────────┐
│  monitor.start()                                                 │
│                                                                  │
│  safeBeat() ──────────────────────────────────────────────┐     │
│    │                                                       │     │
│    ▼                                                       │     │
│  beat()                                                    │     │
│    │                                                       │     │
│    ├─ [1] busca previousBeat (SELECT heartbeat LIMIT 1)   │     │
│    │                                                       │     │
│    ├─ [2] executa check por tipo                          │     │
│    │       └─ mede bean.ping                               │     │
│    │                                                       │     │
│    ├─ [3] retry logic                                      │     │
│    │       ├─ PENDING (retries < maxretries)               │     │
│    │       └─ DOWN (retries >= maxretries)                 │     │
│    │                                                       │     │
│    ├─ [4] detecta importância (state machine)             │     │
│    │       └─ bean.important = true/false                  │     │
│    │                                                       │     │
│    ├─ [5] UptimeCalculator.update(status, ping)           │     │
│    │       ├─ atualiza buckets in-memory                   │     │
│    │       ├─ INSERT/UPDATE stat_minutely                  │     │
│    │       ├─ INSERT/UPDATE stat_hourly                    │     │
│    │       ├─ INSERT/UPDATE stat_daily                     │     │
│    │       └─ DELETE dados antigos (inline)                │     │
│    │                                                       │     │
│    ├─ [6] R.store(bean)  ◄── INSERT heartbeat (individual)│     │
│    │                                                       │     │
│    ├─ [7] io.emit("heartbeat", ...)  ◄── WebSocket        │     │
│    │                                                       │     │
│    ├─ [8] prometheus.update(...)                          │     │
│    │                                                       │     │
│    ├─ [9] sendNotification() se important                 │     │
│    │                                                       │     │
│    └─ [10] setTimeout(safeBeat, intervalRemainingMs) ─────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Paralelamente (cron diário às 3h14):
  clearOldData()
    ├─ DELETE heartbeat (> keepDataPeriodDays)
    └─ DELETE stat_daily (> keepDataPeriodDays)
```
