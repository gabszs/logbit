# UptimeKit — Status Page: Renderização, Cache, Acesso e Subscription

> Arquivos-chave:
> - `apps/status-page/src/app/page.tsx` — rota raiz (domínio customizado)
> - `apps/status-page/src/app/[slug]/page.tsx` — rota por slug
> - `apps/status-page/src/lib/access-check.ts` — verificação de acesso
> - `apps/status-page/src/lib/access-token.ts` — JWT próprio para password
> - `apps/status-page/src/lib/data-preparer.ts` — montagem dos dados para o tema
> - `apps/status-page/src/lib/db-queries.ts` — queries com cache Redis
> - `apps/status-page/src/lib/status-utils.ts` — lógica de status agregado
> - `apps/status-page/src/lib/rate-limit.ts` — rate limiting via Redis
> - `apps/status-page/src/themes/` — sistema de temas
> - `apps/status-page/src/app/api/verify-password/route.ts` — autenticação por senha
> - `apps/status-page/src/app/api/subscribe/route.ts` — subscription de notificações

---

## 1. Dois Modos de Acesso

A status page suporta dois modos de roteamento, resolvidos pelo header HTTP `host`:

### 1.1 Por slug (subdomínio padrão)

```
https://status.uptimekit.com/acme
                              ^^^^
                              slug
```

Rota: `apps/status-page/src/app/[slug]/page.tsx`  
Query: `getStatusPageBySlug(slug)` — busca por `statusPage.slug` no PostgreSQL

### 1.2 Por domínio customizado

```
https://status.acme.com
        ^^^^^^^^^^^^^^^
        domínio próprio configurado no dashboard
```

Rota: `apps/status-page/src/app/page.tsx`  
O servidor lê o header `x-forwarded-host` / `host` e faz `getStatusPageByDomain(domain)` — busca por `statusPage.domain`.

**Lógica de resolução na rota raiz (`/`):**

```typescript
// apps/status-page/src/app/page.tsx
const isStatusPageDomain = host === STATUS_PAGE_DOMAIN; // ex: "status.uptimekit.com"

if (isStatusPageDomain) {
    // É o domínio principal → mostra landing page ou redireciona para DEFAULT_STATUS_PAGE_SLUG
    if (DEFAULT_STATUS_PAGE_SLUG) redirect(`/${DEFAULT_STATUS_PAGE_SLUG}`);
    return <LandingPage />;
}

// É um domínio customizado → busca por domain
const pageConfig = await getStatusPageByDomain(domain);
```

---

## 2. Controle de Acesso — Páginas Privadas com Senha

Após resolver qual status page carregar, a aplicação verifica acesso:

```typescript
// apps/status-page/src/app/[slug]/page.tsx
await checkStatusPageAccess(pageConfig, `/${slug}`);
```

### 2.1 Lógica de acesso

```typescript
// apps/status-page/src/lib/access-check.ts
async function checkStatusPageAccess(statusPage, currentPath) {
    if (statusPage.public)    return;  // pública — libera
    if (!statusPage.password) return;  // privada sem senha — libera (owner ainda não configurou)

    // Verifica token no cookie
    const token = cookies().get(`sp_access_${statusPage.id}`)?.value;
    if (token && verifyAccessToken(token, statusPage.id)) return;

    // Sem token válido → redireciona para tela de senha
    redirect(`/password?pageId=${statusPage.id}&redirect=${encodeURIComponent(currentPath)}`);
}
```

### 2.2 Como o token funciona

Não é JWT padrão — é um token HMAC-SHA256 próprio:

```typescript
// apps/status-page/src/lib/access-token.ts
interface TokenPayload {
    statusPageId: string;
    expiresAt: number;  // epoch ms
}

function sign(payload: TokenPayload): string {
    const data = JSON.stringify(payload);
    const signature = createHmac("sha256", SECRET).update(data).digest("hex");
    return Buffer.from(JSON.stringify({ ...payload, signature })).toString("base64url");
}
```

- `SECRET` = `STATUS_PAGE_ACCESS_SECRET` ou `BETTER_AUTH_SECRET` (fallback)
- Expiração: **24 horas**
- Nome do cookie: `sp_access_{statusPageId}` — um cookie por página
- Comparação de assinatura usa `timingSafeEqual` (proteção contra timing attacks)

### 2.3 Verificação da senha

```
POST /api/verify-password
Body: { statusPageId, password }
```

```typescript
// apps/status-page/src/app/api/verify-password/route.ts

// 1. Rate limit por IP (5 tentativas / 15 minutos)
const { allowed } = await checkRateLimit(`${ip}:${statusPageId}`);

// 2. Verifica senha com Argon2 (@node-rs/argon2)
const isValid = await verify(page.password, password);  // hash Argon2 no DB

// 3. Se válida: gera token e seta cookie HttpOnly
const token = generateAccessToken(statusPageId);
cookies().set(`sp_access_${statusPageId}`, token, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 86400,  // 24h
});
```

**Rate limit de senha:**
- 5 tentativas por janela de 15 minutos
- Por IP + statusPageId
- Responde 429 com header `Retry-After`

---

## 3. Cache Redis — Camada entre Queries e Banco

Todas as queries da status page passam por um wrapper `cached()`:

```typescript
// apps/status-page/src/lib/db-queries.ts
async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const cachedData = await redis.get(key);
    if (cachedData) return JSON.parse(cachedData);   // HIT: retorna sem tocar no banco

    const data = await withRetry(fetcher);           // MISS: executa query (com retry)

    await redis.set(key, JSON.stringify(data), "EX", ttl);
    return data;
}
```

`withRetry` faz até 10 tentativas com backoff exponencial (1s→2s→4s→10s), só para erros `ECONNREFUSED`/`ENOTFOUND`.

### TTLs por query

| Função | Chave Redis | TTL | Fonte |
|---|---|---|---|
| `getStatusPageBySlug(slug)` | `status-page:slug:{slug}` | **600s (10min)** | PostgreSQL |
| `getStatusPageByDomain(domain)` | `status-page:{domain}` | **600s (10min)** | PostgreSQL |
| `getMonitorStatus(monitorId)` | `monitor-status:{id}` | **60s** | ClickHouse |
| `getMonitorUptime(monitorId, days)` | `monitor-uptime:{id}:{days}` | **60s** | ClickHouse |
| `getActiveStatusPageReports(pageId)` | `active-status-page-reports:{id}` | **60s** | PostgreSQL |
| `getStatusPageReports(pageId)` | `status-page-reports:{id}:limit:{n}` | **60s** | PostgreSQL |
| `getStatusPageEvents(pageId, days)` | `status-page:events:{id}:{days}` | **60s** | PostgreSQL |
| `getActiveMaintenances(pageId)` | `active-maintenances:{id}` | **60s** | PostgreSQL |
| `getScheduledMaintenances(pageId)` | `scheduled-maintenances:{id}` | **60s** | PostgreSQL |
| `getActiveIncidents(orgId)` | `active-incidents:{orgId}` | **60s** | PostgreSQL |

A configuração da página (slug, design) tem TTL de 10 minutos porque muda raramente. Dados operacionais (status, uptime, incidentes) têm 60s para refletir mudanças com latência aceitável.

---

## 4. Renderização — Pipeline de Dados

Após resolver acesso e tema, a rota chama `prepareStatusPageData()` que monta todo o payload para o componente de tema.

### 4.1 Queries executadas em paralelo

```typescript
// apps/status-page/src/lib/data-preparer.ts
const [activeReports, activeMaintenances, scheduledMaintenances] = await Promise.all([
    getActiveStatusPageReports(pageConfig.id),   // incidentes ativos publicados
    getActiveMaintenances(pageConfig.id),         // manutenções em andamento
    getScheduledMaintenances(pageConfig.id),      // manutenções agendadas
]);

const [reports, maintenances, events] = await Promise.all([
    getStatusPageReports(pageConfig.id),          // últimos N incidentes resolvidos
    getMaintenanceHistory(pageConfig.id),         // últimas N manutenções concluídas
    getStatusPageEvents(pageConfig.id, barDays),  // incidentes + manutenções (90 dias)
]);
```

### 4.2 Uptime por monitor — dados do ClickHouse

Para cada monitor vinculado à página, busca dados horários do ClickHouse:

```typescript
const hourlyStats = await getMonitorUptime(pm.monitorId, barDays);
// Retorna: [{ date_hour: "2026-04-15 10", total_checks: 60, up_checks: 59, avg_latency: 120 }]
```

Query ClickHouse (cacheada 60s no Redis):

```sql
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

### 4.3 Agregação horária → diária

Os dados horários são agrupados por dia no servidor:

```typescript
// Para cada hora no resultado do ClickHouse:
const dateStr = `${year}-${month}-${day}`;  // ex: "2026-04-15"
daily.total_checks += stat.total_checks;
daily.up_checks += stat.up_checks;
```

### 4.4 Cálculo das uptime bars (90 dias)

`fillMissingDays()` gera exatamente `barDays` entradas (default 90), preenchendo dias sem dados com `status: "unknown"`:

```typescript
for (let i = days - 1; i >= 0; i--) {
    const stat = statsMap.get(dateStr);

    if (stat) {
        const uptime = (stat.up_checks / stat.total_checks) * 100;
        const failedChecks = stat.total_checks - stat.up_checks;
        const downtimeMs = failedChecks * intervalSeconds * 1000;  // estimativa
        result.push({ date, status: uptime < 100 ? "major_outage" : "operational", uptime, downtimeMs });
    } else {
        result.push({ date, status: "unknown", uptime: 0, downtimeMs: 0 });
    }
}
```

**Nota:** `downtimeMs` é estimado multiplicando checks falhados pelo intervalo do monitor — não é tempo real de downtime.

### 4.5 Enriquecimento das bars com incidentes

Após gerar o histórico base, cada dia é sobrescrito com dados dos incidentes publicados:

```typescript
history = history.map((day) => {
    // 1. Se há manutenção no dia → status = "maintenance", uptime = 100%
    const maintenance = events.maintenances.find((m) => overlapsDay(m, day.date));
    if (maintenance) return { ...day, status: "maintenance", uptime: 100 };

    // 2. Se há incidente(s) no dia → calcula uptime real por sobreposição
    const relevantReports = events.reports.filter((r) =>
        r.affectedMonitors.some((am) => am.monitorId === pm.monitorId) &&
        overlapsDay(r, day.date)
    );

    if (relevantReports.length > 0) {
        // Soma overlap de todos os incidentes no dia
        let totalDurationMs = 0;
        for (const r of relevantReports) {
            const overlapStart = max(r.startedAt, dayStart);
            const overlapEnd   = min(r.endedAt ?? now, dayEnd);
            totalDurationMs += overlapEnd - overlapStart;
        }

        const lossRatio = totalDurationMs / 86400000;  // proporção do dia
        const uptime    = (1 - lossRatio) * 100;

        // Pior severidade entre os incidentes do dia
        const status = worstSeverityStatus(relevantReports);

        return { ...day, status, uptime, duration: formatDuration(totalDurationMs) };
    }

    return day;
});
```

**Hierarquia de severity → status:**

| Severity do incidente | StatusType |
|---|---|
| `critical` | `major_outage` |
| `major` | `partial_outage` |
| `minor` / `degraded` | `degraded` |
| (qualquer) | `major_outage` (fallback) |

### 4.6 Status atual do monitor

```typescript
// Ordem de prioridade:
if (isUnderMaintenance)         → "maintenance"
else if (hasActiveIncident)     → conforme severity do incidente
else                            → getMonitorStatus(id)  // ClickHouse LIMIT 1
```

### 4.7 Status geral da página (banner topo)

Agrega o status de todos os monitors com prioridade fixa:

```typescript
// apps/status-page/src/lib/status-utils.ts
// Ordem descendente de severidade:
if (hasMajor)      return "major_outage";
if (hasPartial)    return "partial_outage";
if (hasDegraded)   return "degraded";
if (hasMaintenance) return "maintenance";
if (hasScheduled)  return "maintenance_scheduled";
if (hasUnknown)    return "unknown";
return "operational";
```

---

## 5. Sistema de Temas

A página tem 3 temas built-in, selecionados via `design.themeId` no dashboard:

| themeId | Componente principal |
|---|---|
| `default` | `themes/default/page.tsx` |
| `flat` | `themes/flat/page.tsx` |
| `signal` | `themes/signal/page.tsx` |

### 5.1 Carregamento dinâmico

```typescript
// apps/status-page/src/lib/theme-loader.ts
const themeLoaders = {
    default: () => import("@/themes/default/page"),
    flat:    () => import("@/themes/flat/page"),
    signal:  () => import("@/themes/signal/page"),
};

const ThemePage = await loadThemeComponent(themeId);  // dynamic import
```

Cada tema tem loaders separados para: página principal, detalhe de incidente, detalhe de manutenção, página de updates.

### 5.2 Contrato de dados (ThemePageProps)

Todos os temas recebem exatamente o mesmo `data: StatusPageData`:

```typescript
interface StatusPageData {
    config: {
        id, name, slug,
        design: { themeId, theme, logoUrl, faviconUrl, contactUrl, customCss, headerLayout, barStyle, barDays }
    };
    overallStatus: StatusType;           // status agregado de todos os monitors
    monitorGroups: GroupedMonitors[];    // monitors agrupados + history 90 dias
    activeIssues: Incident[];            // incidentes + manutenções em andamento
    scheduledMaintenances: Maintenance[]; // manutenções agendadas
    pastIncidents: Record<string, Incident[]>; // agrupados por data ("Apr 15, 2026")
    lastUpdated: string;                 // ISO timestamp
}
```

### 5.3 Configurações de design

| Campo | Valores | Efeito |
|---|---|---|
| `theme` | `"light"` / `"dark"` | Tema de cores |
| `themeId` | `"default"` / `"flat"` / `"signal"` | Componente visual |
| `barDays` | `30` / `60` / `90` | Quantidade de dias no histórico de uptime |
| `barStyle` | `"normal"` / `"length"` / `"signal"` | Visual das bars de uptime |
| `headerLayout` | `"vertical"` / `"horizontal"` | Layout do cabeçalho |
| `customCss` | string CSS | Injetado no `<style>` da página |
| `logoUrl` / `faviconUrl` | URL | Branding customizado |
| `contactUrl` | URL | Link de contato no rodapé |
| `allowSubscriptions` | boolean | Habilita formulário de subscription |

---

## 6. Subscription de Notificações

Usuários podem se inscrever para receber notificações de incidentes na status page.

### 6.1 Endpoint

```
POST /api/subscribe
Body: { statusPageId, email, slackWebhookUrl?, discordWebhookUrl? }
```

### 6.2 Validações

```typescript
// apps/status-page/src/app/api/subscribe/route.ts
const subscribeSchema = z.object({
    statusPageId:      z.string().min(1),
    email:             z.email(),
    slackWebhookUrl:   z.url().refine(url => url.startsWith("https://hooks.slack.com/services/")),
    discordWebhookUrl: z.url().refine(url =>
        url.startsWith("https://discord.com/api/webhooks/") ||
        url.startsWith("https://canary.discord.com/api/webhooks/") ||
        url.startsWith("https://ptb.discord.com/api/webhooks/")
    ),
});
```

**Validação de URL do Slack e Discord por prefixo** — rejeita webhooks de outros domínios.

### 6.3 Rate limit

- **10 tentativas / 15 minutos por IP + statusPageId**
- Responde 429 com `Retry-After` e `X-RateLimit-Remaining`

### 6.4 Verificações antes de inserir

1. `design.allowSubscriptions === true` — subscription habilitada na página
2. Se página privada com senha → token válido no cookie é exigido
3. `ON CONFLICT DO NOTHING` — email duplicado é ignorado silenciosamente

### 6.5 O que é armazenado

```sql
INSERT INTO status_page_email_subscribers (
    statusPageId,
    email,           -- normalizado: lowercase + trim
    slackWebhookUrl, -- nullable
    discordWebhookUrl -- nullable
)
```

**Quando o subscriber recebe notificação:** veja [scheduling.md](scheduling.md) — seção `SubscriberNotificationService` (eventos `incident.acknowledged` e `incident.resolved`).

---

## 7. Open Graph (Preview de Link)

Cada status page gera uma imagem OG dinâmica:

```
GET /{slug}/api/og
```

Usado automaticamente em `generateMetadata()`:
```typescript
openGraph: {
    images: [{ url: `${protocol}://${host}/${slug}/api/og`, width: 1200, height: 630 }]
}
```

---

## 8. Rotas Disponíveis

| Rota | Descrição |
|---|---|
| `/` | Resolução por domínio customizado ou landing page |
| `/[slug]` | Status page por slug |
| `/[slug]/incidents/[id]` | Detalhe de incidente |
| `/[slug]/maintenance/[id]` | Detalhe de manutenção |
| `/[slug]/updates` | Timeline de atualizações (filtro por período: 30d/90d/365d/all) |
| `/[slug]/api/og` | Imagem Open Graph |
| `/password` | Tela de senha para páginas protegidas |
| `/api/verify-password` | POST — verifica senha e seta cookie |
| `/api/subscribe` | POST — cadastra subscriber |

---

## 9. Diagrama de Renderização

```
Usuário acessa https://status.acme.com
  │
  ├─ app/page.tsx lê header "host" = "status.acme.com"
  ├─ Não é o STATUS_PAGE_DOMAIN → modo domínio customizado
  │
  ├─ getStatusPageByDomain("status.acme.com")
  │   └─ [Redis 10min] → PostgreSQL: SELECT * FROM status_page WHERE domain = ?
  │
  ├─ checkStatusPageAccess(page, "/")
  │   ├─ page.public = false, page.password = hash
  │   ├─ Lê cookie sp_access_{pageId}
  │   └─ Sem token válido → redirect("/password?pageId=...&redirect=/")
  │
  ├─ [Usuário digita senha]
  │   ├─ POST /api/verify-password
  │   │   ├─ Rate limit: 5x/15min por IP
  │   │   ├─ verify(hash, password) via Argon2
  │   │   └─ Set-Cookie: sp_access_{pageId}=<token> (HttpOnly, 24h)
  │   └─ redirect("/")
  │
  ├─ loadThemeComponent("default")  → dynamic import
  │
  ├─ prepareStatusPageData(pageConfig)
  │   │
  │   ├─ Promise.all:
  │   │   ├─ getActiveStatusPageReports()   → [Redis 60s] → PostgreSQL
  │   │   ├─ getActiveMaintenances()        → [Redis 60s] → PostgreSQL
  │   │   └─ getScheduledMaintenances()     → [Redis 60s] → PostgreSQL
  │   │
  │   ├─ Promise.all:
  │   │   ├─ getStatusPageReports()         → [Redis 60s] → PostgreSQL
  │   │   ├─ getMaintenanceHistory()        → [Redis 60s] → PostgreSQL
  │   │   └─ getStatusPageEvents(90d)       → [Redis 60s] → PostgreSQL
  │   │
  │   └─ Para cada monitor:
  │       ├─ getMonitorUptime(id, 90)       → [Redis 60s] → ClickHouse (GROUP BY hora)
  │       ├─ Agrega horas → dias (90 entradas)
  │       ├─ Enriquece dias com incidentes publicados (overlap de timestamp)
  │       └─ getMonitorStatus(id)           → [Redis 60s] → ClickHouse (LIMIT 1)
  │
  ├─ calculateAggregateStatus([...statuses]) → status geral da página
  │
  └─ <ThemePage data={StatusPageData} />
      └─ Renderiza: banner de status, monitors com uptime bars,
         incidentes ativos, manutenções, histórico de incidentes
```

---

## 10. Pontos de Atenção

1. **Cache não é invalidado proativamente** — quando um incidente é criado/resolvido, o cache Redis não é purgado. O usuário pode ver a status page desatualizada por até 60s.

2. **Queries em série por monitor** — `prepareStatusPageData` faz um `Promise.all` por monitor, mas cada monitor dispara 2 queries (uptime + status). Em páginas com muitos monitors, isso pode gerar dezenas de queries ao ClickHouse antes do cache aquecer.

3. **Downtime estimado, não exato** — o `downtimeMs` nas uptime bars é `failedChecks × intervalSeconds`, não o tempo real de downtime. Para tempo real, o enriquecimento por incidentes (seção 4.5) é mais preciso.

4. **Cookie por página** — cada status page protegida gera um cookie separado (`sp_access_{pageId}`). Usuário com acesso a 10 páginas privadas acumula 10 cookies.

5. **`getStatusPageByDomain` só busca por `domain` exato** — não tem fallback para slug em domínio customizado. Se a coluna `domain` estiver vazia, a página não é encontrada por domínio.

6. **Sem revalidação automática (SSR puro)** — a página é Server-Side Rendered a cada request. Não usa ISR (Incremental Static Regeneration) do Next.js. O Redis serve como cache de query, não de página.
