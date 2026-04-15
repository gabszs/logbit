# ClickHouse no UptimeKit — Análise Detalhada

> Arquivos-chave:
> - `packages/db/src/clickhouse.ts` — cliente, bootstrap e Proxy
> - `packages/api/src/types/clickhouse.ts` — tipos TypeScript dos resultados
> - `packages/api/src/pkg/worker/service.ts` — escritas (inserts)
> - `packages/api/src/routers/monitors.ts` — leituras do dashboard
> - `apps/status-page/src/lib/db-queries.ts` — leituras da status page
> - `packages/scheduler/src/jobs/data-retention.ts` — deleção de dados antigos

---

## 1. Papel do ClickHouse

O ClickHouse é o banco de **time-series** do UptimeKit. O PostgreSQL guarda a configuração (quais monitors existem, incidentes, status pages, etc), enquanto o ClickHouse guarda **todos os dados de monitoramento em si** — cada resultado de check e cada transição de status.

As duas responsabilidades são bem separadas:

| Pergunta | Banco |
|---|---|
| "Quais monitors existem?" | PostgreSQL |
| "Este monitor está up ou down agora?" | ClickHouse |
| "Qual foi a latência das últimas 24h?" | ClickHouse |
| "Houve um incidente?" | PostgreSQL |
| "Quando o monitor mudou de status?" | ClickHouse |

---

## 2. Schemas Criados

O bootstrap cria um database e duas tabelas. Não há migrações incrementais — as tabelas são criadas via `CREATE TABLE IF NOT EXISTS` na inicialização da aplicação.

### Database

```sql
CREATE DATABASE IF NOT EXISTS uptimekit
```

### Tabela: `uptimekit.monitor_events`

Armazena **cada resultado individual de check** que o worker envia. É a tabela mais volumosa.

```sql
CREATE TABLE IF NOT EXISTS uptimekit.monitor_events (
    id            UUID,
    monitorId     String,
    status        String,           -- "up", "down", "degraded", "maintenance", "pending"
    latency       UInt32,           -- ms (tempo total)
    timestamp     DateTime64(3),    -- precisão de milissegundos
    statusCode    Nullable(UInt16), -- HTTP status code
    error         Nullable(String), -- mensagem de erro quando down
    location      Nullable(String), -- ID do worker que executou o check
    dnsLookup     Nullable(UInt32), -- ms
    tcpConnect    Nullable(UInt32), -- ms
    tlsHandshake  Nullable(UInt32), -- ms
    ttfb          Nullable(UInt32), -- time to first byte, ms
    transfer      Nullable(UInt32)  -- ms
) ENGINE = MergeTree()
ORDER BY (monitorId, timestamp)
```

**Por que MergeTree ordenado por `(monitorId, timestamp)`:**  
Todas as queries filtram por `monitorId` e ordenam/filtram por `timestamp`. Essa ordem de sort key garante que o ClickHouse leia apenas os blocos relevantes (sparse index), tornando queries como "últimos eventos de um monitor" extremamente eficientes.

### Tabela: `uptimekit.monitor_changes`

Armazena apenas as **transições de status** (up→down, down→up). É muito menor que `monitor_events`.

```sql
CREATE TABLE IF NOT EXISTS uptimekit.monitor_changes (
    id         UUID,
    monitorId  String,
    status     String,          -- status para o qual transitou
    timestamp  DateTime64(3),
    location   Nullable(String) -- worker que detectou a mudança
) ENGINE = MergeTree()
ORDER BY (monitorId, timestamp)
```

Também há TTLs nos logs internos do sistema ClickHouse (query_log, metric_log, etc.) que são configurados para 3 dias:

```sql
ALTER TABLE system.query_log MODIFY TTL event_date + INTERVAL 3 DAY
-- idem para: query_thread_log, trace_log, asynchronous_metric_log, metric_log, error_log, part_log
```

---

## 3. Como o Cliente é Inicializado

O cliente usa um padrão **Proxy com lazy initialization e singleton**:

```
packages/db/src/clickhouse.ts
```

```typescript
// Singleton do cliente
let _clickhouse: ClickHouseClient | null = null;

// Promise de inicialização do schema (executa uma única vez)
let _clickhouseInit: Promise<void> | null = null;

// Proxy que intercepta chamadas aos métodos do cliente
export const clickhouse = new Proxy({} as ClickHouseClient, {
    get(_target, prop) {
        const client = getClickHouse();

        // Para qualquer método que acessa dados (query, insert, command, exec),
        // garante que o schema já foi criado antes de executar
        if (METHODS_REQUIRING_SCHEMA.has(prop)) {
            return async (...args) => {
                await ensureClickHouseSchema(); // cria tabelas se não existirem
                return client[prop](...args);
            };
        }

        return client[prop];
    }
});
```

**O que isso significa na prática:**
- A primeira chamada a `clickhouse.query(...)` ou `clickhouse.insert(...)` dispara o bootstrap (cria database e tabelas)
- Chamadas subsequentes saltam o bootstrap (a Promise já está resolvida e cacheada em `_clickhouseInit`)
- Não é necessário rodar um script de migration separado para o ClickHouse no código da aplicação — ele se auto-inicializa
- O script de migration (`packages/db/src/migrate.ts`) também executa o mesmo DDL explicitamente no startup via Docker

**Configuração de conexão:**

```typescript
createClient({
    url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER || "default",
    password: process.env.CLICKHOUSE_PASSWORD || "",
    request_timeout: 30000,  // 30s
    max_open_connections: 10,
})
```

---

## 4. Escritas — Como e Quando Acontecem

### 4.1 Fluxo de escrita

As escritas ocorrem em `processMonitorEvents()` ([service.ts](../../otel/uptimekit/packages/api/src/pkg/worker/service.ts)), chamado quando o worker POST `/api/worker/events`.

O worker pode enviar **vários eventos de vários monitors** em uma única requisição. O código processa tudo junto e faz **dois inserts em batch no final**:

```
Requisição do worker
  └─> processMonitorEvents(events[])     // pode ter N eventos de M monitors
        │
        ├─> Para cada monitor:
        │     ├─> Consulta ClickHouse: último status regional (ROW_NUMBER)
        │     ├─> Consulta ClickHouse: último evento global (LIMIT 1)
        │     └─> Se status mudou → adiciona em changesToInsert[]
        │
        ├─> INSERT batch em monitor_changes   ← um único INSERT com todos
        ├─> INSERT batch em monitor_events    ← um único INSERT com todos
        └─> Inserts em PostgreSQL (incidentes, etc.)
```

### 4.2 Insert de monitor_changes (mudanças de status)

Só insere quando detecta uma transição de status. Não é todo evento que gera uma linha aqui.

```typescript
// service.ts:158
if (changesToInsert.length > 0) {
    await clickhouse.insert({
        table: "uptimekit.monitor_changes",
        values: changesToInsert.map((c) => ({
            ...c,
            timestamp: c.timestamp.getTime(), // converte Date para epoch ms
        })),
        format: "JSONEachRow",
    });
}
```

### 4.3 Insert de monitor_events (todos os eventos)

Todos os eventos da requisição são inseridos de uma vez:

```typescript
// service.ts:195
if (events.length > 0) {
    await clickhouse.insert({
        table: "uptimekit.monitor_events",
        values: events.map((e) => ({
            id: crypto.randomUUID(),
            monitorId: e.monitorId,
            status: e.status,
            latency: e.latency,
            timestamp: new Date(e.timestamp).getTime(), // epoch ms
            statusCode: e.statusCode,
            error: e.error,
            location: e.location || workerId,
            dnsLookup: e.timings?.dnsLookup,
            tcpConnect: e.timings?.tcpConnect,
            tlsHandshake: e.timings?.tlsHandshake,
            ttfb: e.timings?.ttfb,
            transfer: e.timings?.transfer,
        })),
        format: "JSONEachRow",
    });
}
```

### 4.4 É batch?

**Sim, mas o batch é por requisição do worker, não por acúmulo temporal.**

Não existe um buffer/queue que acumula eventos por alguns segundos e depois faz flush (como seria típico em ingestão de alta escala). O insert acontece sincronamente durante o processamento da requisição HTTP do worker.

Na prática o "batch" existe porque:
- O worker executa checks de múltiplos monitors antes de enviar
- Todos os resultados desse ciclo chegam juntos em um único POST
- O dashboard insere todos em um único `clickhouse.insert()` com `format: "JSONEachRow"`

O `JSONEachRow` significa que os valores são enviados como JSON, um objeto por linha — o ClickHouse client serializa o array e envia em uma única requisição HTTP para o ClickHouse.

---

## 5. Leituras — Todas as Queries

### 5.1 Último status por monitor (batch, para listagem)

Usada no router `monitors.list` para popular o status de todos os monitors de uma organização de uma só vez — evita N queries.

```sql
-- BATCH_LATEST_EVENTS_QUERY (monitors.ts:37)
SELECT monitorId, status, timestamp
FROM (
    SELECT monitorId, status, timestamp,
        ROW_NUMBER() OVER (PARTITION BY monitorId ORDER BY timestamp DESC) as rn
    FROM uptimekit.monitor_events
    WHERE monitorId IN ({ids:Array(String)})
) WHERE rn = 1
```

```sql
-- BATCH_LATEST_CHANGES_QUERY (monitors.ts:47)
SELECT monitorId, timestamp
FROM (
    SELECT monitorId, timestamp,
        ROW_NUMBER() OVER (PARTITION BY monitorId ORDER BY timestamp DESC) as rn
    FROM uptimekit.monitor_changes
    WHERE monitorId IN ({ids:Array(String)})
) WHERE rn = 1
```

### 5.2 Último status de um monitor específico

Usado ao abrir a página de detalhe de um monitor.

```sql
-- monitors.ts:695
SELECT status, timestamp
FROM uptimekit.monitor_events
WHERE monitorId = {id:String}
ORDER BY timestamp DESC
LIMIT 1
```

```sql
-- monitors.ts:703 — última mudança de status
SELECT timestamp
FROM uptimekit.monitor_changes
WHERE monitorId = {id:String}
ORDER BY timestamp DESC
LIMIT 1
```

### 5.3 Status mais recente por região (para detecção de incidente)

Usada durante o processamento de eventos para saber o estado atual de cada worker region antes de decidir se abre incidente.

```sql
-- service.ts:337
SELECT location, status, timestamp
FROM (
    SELECT
        location,
        status,
        timestamp,
        ROW_NUMBER() OVER (PARTITION BY location ORDER BY timestamp DESC) AS rn
    FROM uptimekit.monitor_events
    WHERE monitorId = {monitorId:String}
)
WHERE rn = 1
```

### 5.4 Tempo de resposta médio

```sql
-- monitors.ts:788
SELECT avg(latency) as value
FROM uptimekit.monitor_events
WHERE monitorId = {monitorId:String}
  AND timestamp >= toDateTime64({startDate:UInt64} / 1000, 3)
```

### 5.5 Histórico de mudanças de status (paginado por cursor)

Usado no timeline da página de detalhe de um monitor. Paginação por timestamp (cursor-based).

```sql
-- monitors.ts:870
SELECT id, status, timestamp, location
FROM uptimekit.monitor_changes
WHERE monitorId = {monitorId:String}
  [AND timestamp < {cursor:DateTime}]   -- opcional, para paginação
ORDER BY timestamp DESC
LIMIT {limit:UInt32}
```

### 5.6 Dados de response time para gráficos

Retorna até 2000 pontos brutos para renderizar o gráfico de latência. Filtra por range de tempo e opcionalmente por worker.

```sql
-- monitors.ts:971
SELECT timestamp, location, latency, dnsLookup, tcpConnect, tlsHandshake, ttfb, transfer
FROM uptimekit.monitor_events
WHERE monitorId = {monitorId:String}
  AND timestamp >= toDateTime64({startDate:UInt64} / 1000, 3)
  [AND location IN {workerIds:Array(String)}]   -- filtro opcional por worker
ORDER BY timestamp ASC
LIMIT 2000
```

### 5.7 Mini-gráfico de latência (sparkline, últimos 20 pontos por monitor)

Usado na listagem de monitors para o mini-gráfico de cada linha.

```sql
-- monitors.ts:1151
SELECT monitorId, latency, timestamp
FROM (
    SELECT monitorId, latency, timestamp,
        ROW_NUMBER() OVER (PARTITION BY monitorId ORDER BY timestamp DESC) as rn
    FROM uptimekit.monitor_events
    WHERE monitorId IN ({ids:Array(String)})
) WHERE rn <= 20
ORDER BY monitorId, timestamp ASC
```

### 5.8 Uptime % por hora (status page)

Agregação por hora para o histórico de disponibilidade na status page. Cacheada no Redis por 1 minuto.

```sql
-- db-queries.ts:345
SELECT
    formatDateTime(timestamp, '%Y-%m-%d %H') as date_hour,
    count(*) as total_checks,
    countIf(lower(status) = 'up') as up_checks,
    avg(latency) as avg_latency
FROM uptimekit.monitor_events
WHERE monitorId = {monitorId:String}
  AND timestamp >= {startDate:DateTime64(3)}
GROUP BY date_hour
ORDER BY date_hour DESC
```

### 5.9 Status atual do monitor (status page)

Cached no Redis por 1 minuto.

```sql
-- db-queries.ts:705
SELECT status, timestamp
FROM uptimekit.monitor_events
WHERE monitorId = {monitorId:String}
ORDER BY timestamp DESC
LIMIT 1
```

---

## 6. Deleção de Dados (Data Retention)

O job `data-retention` roda todo dia às 02:00 AM via BullMQ/cron. O período de retenção é configurável no PostgreSQL (tabela `configuration`, chave `data_retention_days`, default 30).

Usa **mutations do ClickHouse** (`ALTER TABLE ... DELETE`), que são operações assíncronas pesadas — o ClickHouse não deleta inline, mas agenda a deleção para ser executada em background durante merges.

```sql
-- data-retention.ts
ALTER TABLE uptimekit.monitor_events
DELETE WHERE timestamp < toDateTime64({cutoff:UInt64} / 1000, 3)

ALTER TABLE uptimekit.monitor_changes
DELETE WHERE timestamp < toDateTime64({cutoff:UInt64} / 1000, 3)
```

**Observação:** `ALTER TABLE DELETE` em MergeTree é uma mutation e não é transacional. É a forma padrão de deletar dados no ClickHouse, mas deve ser usado com moderação em produção pois reescreve partes (parts) do disco.

---

## 7. Cache Redis sobre as Queries ClickHouse

As queries da status page (`apps/status-page/src/lib/db-queries.ts`) passam por um wrapper de cache Redis antes de ir ao ClickHouse:

```typescript
async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const cachedData = await redis.get(key);
    if (cachedData) return JSON.parse(cachedData);

    const data = await withRetry(fetcher); // inclui retry com backoff exponencial
    await redis.set(key, JSON.stringify(data), "EX", ttl);
    return data;
}
```

| Query | TTL Redis |
|---|---|
| `getMonitorStatus` | 60s |
| `getMonitorUptime` | 60s |
| `getStatusPageBySlug` / `getStatusPageByDomain` | 600s (10min) |
| `getStatusPageEvents` | 60s |
| `getActiveIncidents` | 60s |
| `getActiveMaintenances` | 60s |

O retry inclui backoff exponencial (1s, 2s, 4s... até 10s), só para erros `ECONNREFUSED`/`ENOTFOUND`.

---

## 8. Resumo Visual

```
Worker POST /api/worker/events
  │
  └─> processMonitorEvents(events[])
        │
        ├─> [leitura] ClickHouse: último evento por região (ROW_NUMBER PARTITION BY location)
        ├─> [leitura] ClickHouse: último evento global (ORDER BY timestamp DESC LIMIT 1)
        │
        ├─> detecta mudanças de status
        │
        ├─> [escrita batch] INSERT INTO monitor_changes   (apenas mudanças)
        └─> [escrita batch] INSERT INTO monitor_events    (todos os eventos)

Dashboard GET /monitors
  └─> [leitura batch] ROW_NUMBER PARTITION BY monitorId → último status de todos os monitors

Dashboard GET /monitors/:id
  ├─> [leitura] último evento (LIMIT 1)
  ├─> [leitura] última mudança (LIMIT 1)
  ├─> [leitura] response times para gráfico (LIMIT 2000)
  └─> [leitura paginada] histórico de mudanças (cursor por timestamp)

Status Page
  ├─> [Redis cache 60s] → [leitura] último status (LIMIT 1)
  └─> [Redis cache 60s] → [leitura] uptime % por hora (GROUP BY hora)

Scheduler 02:00 AM
  └─> ALTER TABLE DELETE WHERE timestamp < cutoff   (ambas as tabelas)
```

---

## 9. Pontos de Atenção

1. **Sem buffer de escrita**: inserts são síncronos por requisição. Em volumes muito altos de workers, pode ser um gargalo. Para escala maior, seria interessante um buffer assíncrono (ex: inserir em fila e flush periódico).

2. **`ALTER TABLE DELETE` é mutation**: não é instantâneo. Em tabelas muito grandes, pode gerar pressão de I/O. Uma alternativa mais eficiente seria usar TTL nativo do ClickHouse: `TTL timestamp + INTERVAL 30 DAY`.

3. **Sem TTL nativo nas tabelas**: as tabelas não definem `TTL` no DDL. A retenção é feita manualmente pelo job cron — se o scheduler parar, dados acumulam indefinidamente.

4. **ROW_NUMBER() em tabelas grandes**: as queries de "último evento por monitor" usam window functions. Em tabelas com bilhões de rows, isso pode ser lento sem particionamento adequado. O `ORDER KEY (monitorId, timestamp)` ajuda, mas não elimina o problema.

5. **Sem réplicas ou shards**: a configuração é single-node ClickHouse. Para HA precisaria de `ReplicatedMergeTree` com ZooKeeper/ClickHouse Keeper.
