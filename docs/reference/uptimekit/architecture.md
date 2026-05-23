# UptimeKit — Diagrama de Arquitetura

## Visão Geral do Sistema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              UPTIMEKIT v3.0.2                                   │
│                    Bun 1.3.11 Workspaces  +  Turborepo 2.9                      │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐   Browser    ┌──────────────────────────────────────┐
│    Usuário   │──────────────▶        apps/dash  :3000              │
│   (Admin)    │              │     Next.js 16  ·  React 19           │
└──────────────┘              │     Radix UI  ·  TailwindCSS 4        │
                              │     TanStack Query  ·  oRPC client    │
┌──────────────┐   Browser    │     Better Auth client                │
│   Visitante  │──────────────▶        apps/status-page  :3001       │
│  (Público)   │              │     Next.js 16  ·  React 19           │
└──────────────┘              │     Themes: default / flat / signal   │
                              └──────────────┬───────────────────────┘
                                             │ oRPC (HTTP)
                              ┌──────────────▼───────────────────────┐
                              │         packages/api                  │
                              │   oRPC server  ·  12 routers         │
                              │   IntegrationService  ·  EventBus     │
                              │   SubscriberNotificationService       │
                              └──┬──────────┬──────────┬─────────────┘
                                 │          │          │
               ┌─────────────────▼──┐  ┌───▼───┐  ┌──▼──────────────┐
               │   packages/db       │  │ Redis  │  │  ClickHouse     │
               │  PostgreSQL 17/18   │  │ 8.0    │  │  monitor_events │
               │  Drizzle ORM        │  │ BullMQ │  │  monitor_changes│
               │  12 tabelas         │  │ Cache  │  │  (time-series)  │
               └─────────────────────┘  └───┬───┘  └─────────────────┘
                                            │
                              ┌─────────────▼────────────┐
                              │    packages/scheduler     │
                              │    BullMQ Worker (Bun)    │
                              │    maintenance-processor  │
                              │    data-retention         │
                              │    config-integrity       │
                              └──────────────────────────┘

┌──────────────┐  Bearer token  ┌──────────────────────────────────────┐
│ apps/worker  │────────────────▶   /api/worker/{heartbeat,events,cert} │
│   (Go 1.25)  │◀────────────────   dentro do apps/dash                │
│  HTTP·TCP    │  monitors[]    └──────────────────────────────────────┘
│  Ping·JSON   │
│  Keyword·SSL │
└──────────────┘

                    ┌──────────────────────────────────┐
                    │    packages/auth                  │
                    │    Better Auth 1.6                │
                    │    Sessions · OAuth2 · TOTP       │
                    │    API Keys · Organizations        │
                    └──────────────────────────────────┘

                    ┌──────────────────────────────────┐
                    │    packages/config                │
                    │    env vars + tsconfig base       │
                    └──────────────────────────────────┘
```

---

## Fluxo de Dados Principal

```
Worker (Go)
    │  POST /api/worker/heartbeat  →  recebe lista de monitors
    │  POST /api/worker/events     →  envia resultados
    │  POST /api/worker/cert/:id   →  envia dados de SSL
    ▼
apps/dash (Next.js route handler)
    │  authenticateWorker()  →  SHA-256 hash → DB lookup → cache 60s
    │  processMonitorEvents()
    ▼
packages/api/worker/service.ts
    │  ClickHouse INSERT (monitor_events, monitor_changes)
    │  PostgreSQL UPDATE (incidents, monitors)
    ▼
EventBus (TypedEventEmitter)
    │  incident.created / resolved / acknowledged / comment_added
    ▼
IntegrationService          SubscriberNotificationService
    │  Discord               │  Email (Resend / SMTP)
    │  Telegram              │  Slack webhook
    │  Webhook genérico      │  Discord webhook
    │  (AlertManager recebe  └─ (acknowledged + resolved only)
    │   no sentido inverso)
    ▼
packages/scheduler (BullMQ / Redis)
    │  maintenance-processor  →  cron "* * * * *"
    │  data-retention         →  cron "0 2 * * *"
    └  config-integrity       →  validação de configuração
```

---

## Infraestrutura (Docker)

```
┌─────────────────────────────────────────────────────────┐
│                   docker network                         │
│                                                          │
│  ┌──────────────┐    ┌────────────────┐                 │
│  │     dash     │    │  status-page   │                 │
│  │   :3000      │    │    :3001       │                 │
│  │  Bun/Next.js │    │  Bun/Next.js   │                 │
│  └──────┬───────┘    └───────┬────────┘                 │
│         │                    │                          │
│  ┌──────▼────────────────────▼────────┐                 │
│  │           scheduler                │                 │
│  │        Bun (background)            │                 │
│  └──────────────┬─────────────────────┘                 │
│                 │                                        │
│  ┌──────────────▼──┐  ┌────────┐  ┌──────────────────┐ │
│  │  PostgreSQL 17   │  │ Redis  │  │   ClickHouse     │ │
│  │  db_data volume  │  │  8.0   │  │ clickhouse_data   │ │
│  └─────────────────┘  └────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────┘

Worker (Go) — processo externo, sem Dockerfile no compose
  conecta via DASHBOARD_URL (HTTP)
```

---

## Drilldown: `apps/`

### `apps/dash/` — Dashboard (Next.js 16, React 19)

```
apps/dash/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...all]/      ← Better Auth handler
│   │   │   ├── health/             ← GET /api/health (Docker healthcheck)
│   │   │   ├── rpc/[...all]/       ← oRPC HTTP handler
│   │   │   ├── webhooks/
│   │   │   │   └── integrations/[integrationId]/  ← AlertManager receiver
│   │   │   └── worker/
│   │   │       ├── heartbeat/      ← POST (Go worker poll)
│   │   │       ├── events/         ← POST (check results)
│   │   │       └── cert/[monitorId]/  ← POST (SSL info)
│   │   ├── (dashboard)/            ← rotas protegidas
│   │   │   ├── monitors/
│   │   │   ├── incidents/
│   │   │   ├── status-pages/
│   │   │   ├── integrations/
│   │   │   └── settings/
│   │   ├── (public)/               ← landing e páginas abertas
│   │   ├── admin/                  ← painel administrativo
│   │   ├── login/ register/ two-factor/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                     ← Radix UI + shadcn (Button, Dialog, etc.)
│   │   ├── monitors/               ← MonitorCard, MonitorForm, UptimeBar
│   │   ├── incidents/              ← IncidentRow, Timeline, AcknowledgeButton
│   │   ├── integrations/           ← IntegrationCard, ConfigForm por tipo
│   │   ├── status-pages/           ← StatusPageEditor, MonitorSelector
│   │   ├── settings/               ← OrganizationRow, InvitationRow, ApiKeyRow
│   │   ├── auth/                   ← LoginForm, TwoFactorForm
│   │   ├── layout/                 ← Sidebar, Header, Breadcrumb
│   │   ├── common/                 ← CopyButton, LabeledSwitch, EmptyState
│   │   ├── providers/              ← QueryClientProvider, ThemeProvider
│   │   └── theme/                  ← dark/light toggle
│   ├── hooks/                      ← useMonitors, useIncidents, etc.
│   ├── lib/
│   │   └── actions/                ← Next.js Server Actions
│   └── utils/
│       └── api.ts                  ← oRPC client configurado
├── Dockerfile                      ← multi-stage Bun build
└── package.json
```

**Libs principais:**

| Categoria | Lib | Versão |
|---|---|---|
| Framework | Next.js | 16.2.3 |
| UI runtime | React + React-DOM | 19.2.1 |
| Componentes | Radix UI (14+ primitivos) | várias |
| Estilo | TailwindCSS | 4.2.2 |
| Variantes | class-variance-authority | 0.7.1 |
| RPC client | @orpc/client + @orpc/tanstack-query | 1.13.13 |
| Data fetching | @tanstack/react-query | 5.96.2 |
| Formulários | @tanstack/react-form | 1.28.6 |
| Auth client | better-auth | 1.6.1 |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable | 6.3 / 10.0 |
| Gráficos | recharts | 2.15.4 |
| Mapas | maplibre-gl | 5.22.0 |
| Datas | date-fns | 4.1.0 |
| URL state | nuqs | 2.8.9 |
| ORM | drizzle-orm | 0.45.2 |

---

### `apps/status-page/` — Status Page Pública (Next.js 16)

```
apps/status-page/
├── src/
│   ├── app/
│   │   ├── page.tsx                ← root: resolve por host header ou slug default
│   │   ├── [slug]/
│   │   │   ├── page.tsx            ← busca page → verifica acesso → carrega tema → dados
│   │   │   ├── api/
│   │   │   │   └── og/             ← GET /[slug]/api/og (Open Graph image)
│   │   │   ├── incidents/
│   │   │   ├── maintenance/
│   │   │   ├── updates/
│   │   │   └── password/           ← form de senha protegida
│   │   └── api/
│   │       ├── verify-password/    ← POST (Argon2 verify, rate limit 5/15min)
│   │       └── subscribe/          ← POST (email/slack/discord, rate limit 10/15min)
│   ├── components/ui/              ← componentes compartilhados
│   ├── lib/
│   │   ├── access-token.ts         ← HMAC-SHA256, cookie sp_access_{id}, 24h
│   │   ├── data-preparer.ts        ← prepareStatusPageData(), uptime bars
│   │   └── cache.ts                ← Redis cache helpers
│   └── themes/
│       ├── default/                ← tema padrão (cards, barra de uptime)
│       ├── flat/                   ← tema minimalista
│       └── signal/                 ← tema com foco em status visual
├── Dockerfile
└── package.json
```

**Libs principais:**

| Categoria | Lib | Versão |
|---|---|---|
| Framework | Next.js | 16.2.3 |
| Animações | motion | 12.38.0 |
| Redis | ioredis | 5.10.1 |
| ClickHouse | @clickhouse/client | 1.18.2 |
| Hash de senha | @node-rs/argon2 | 2.0.2 |
| ORM | drizzle-orm | 0.45.2 |

---

### `apps/worker/` — Agente de Monitoramento (Go 1.25)

```
apps/worker/
├── cmd/worker/
│   └── main.go                     ← entry point: tick loop (time.Ticker)
├── internal/
│   ├── monitor/
│   │   ├── monitor.go              ← interface Monitor + resultado
│   │   ├── registry.go             ← map[type]Monitor
│   │   ├── http.go                 ← HTTP check com httptrace (DNS/TCP/TLS/TTFB)
│   │   ├── tcp.go                  ← TCP connect
│   │   ├── ping.go                 ← ICMP ping (pro-bing)
│   │   ├── json.go                 ← JSON response + JSONPath assertion
│   │   └── keyword.go              ← keyword match no body
│   ├── api/
│   │   ├── client.go               ← HTTP client com retry (4x, exp backoff)
│   │   └── client_test.go
│   └── config/
│       └── config.go               ← WORKER_API_KEY, DASHBOARD_URL, CHECK_INTERVAL
├── go.mod
├── go.sum
└── Dockerfile                      ← multi-stage Go build → alpine runtime
```

**Libs Go:**

| Lib | Uso |
|---|---|
| `net/http` + `httptrace` | HTTP checks com timings detalhados |
| `pro-bing` (prometheus-community) | ICMP ping |
| `gval` + `jsonpath` (PaesslerAG) | JSONPath + avaliação de expressões |
| `godotenv` | Carregamento de `.env` |
| `golang.org/x/sync` | `sync.WaitGroup` para goroutines paralelas |
| `google/uuid` | Geração de IDs |

**Tipos de monitor suportados:**

| Tipo | Protocolo | Assertivas |
|---|---|---|
| `http` | HTTP/HTTPS | status code, keyword, SSL cert |
| `tcp` | TCP | connect success/timeout |
| `ping` | ICMP | packet loss, RTT |
| `json` | HTTP + JSONPath | valor esperado via expressão |
| `keyword` | HTTP | presença/ausência de string no body |

---

## Drilldown: `packages/`

### `packages/api/` — Camada de API (oRPC)

```
packages/api/
└── src/
    ├── index.ts                    ← export principal (router, tipos)
    ├── context.ts                  ← ORPCContext (session, db, org)
    ├── lib/
    │   ├── events.ts               ← TypedEventEmitter (EventBus)
    │   ├── ssrf.ts                 ← assertSafeWebhookUrl()
    │   ├── rate-limit.ts           ← sliding window Redis
    │   └── ...
    ├── routers/
    │   ├── monitors.ts             ← CRUD + toggle + test
    │   ├── incidents.ts            ← CRUD + acknowledge + resolve
    │   ├── status-pages.ts         ← CRUD + password + custom domain
    │   ├── integrations.ts         ← configure + test + toggle + delete
    │   ├── workers.ts              ← create + rotateKey + delete + update
    │   ├── organizations.ts        ← CRUD + members + invitations
    │   ├── users.ts                ← profile, API keys, 2FA
    │   ├── maintenance.ts          ← janelas de manutenção
    │   ├── subscribers.ts          ← inscrições de notificação
    │   ├── status-updates.ts       ← posts de atualização de status
    │   ├── configuration.ts        ← configurações globais
    │   └── tags.ts                 ← tagging de recursos
    └── pkg/
        ├── integrations/
        │   ├── registry.ts         ← IntegrationRegistry (Map singleton)
        │   ├── service.ts          ← listener do EventBus
        │   └── definitions/
        │       ├── discord-meta.ts / discord.ts
        │       ├── telegram-meta.ts / telegram.ts
        │       ├── webhook-meta.ts / webhook.ts
        │       └── alertmanager-meta.ts / alertmanager.ts
        ├── subscribers/
        │   └── service.ts          ← email + slack + discord notifications
        └── worker/
            ├── auth.ts             ← authenticateWorker() + cache
            └── service.ts          ← processMonitorEvents()
```

**Libs principais:**

| Categoria | Lib |
|---|---|
| RPC | @orpc/server, @orpc/client, @orpc/openapi, @orpc/zod |
| Validação | zod |
| ORM | drizzle-orm |
| Cache/Queue | ioredis |
| Email | nodemailer |
| ClickHouse | @clickhouse/client |
| Hash | @node-rs/argon2 |

**Routers — resumo por domínio:**

| Router | Procedures | Auth |
|---|---|---|
| `monitors` | list, get, create, update, delete, toggle, test | writeProcedure |
| `incidents` | list, get, create, acknowledge, resolve, delete | writeProcedure |
| `integrations` | available, configured, configure, test, toggle, delete | writeProcedure |
| `workers` | list, create, update, rotateKey, delete | admin only |
| `organizations` | get, update, members, invitations, roles | owner/admin |
| `users` | profile, updatePassword, apiKeys, 2FA | protectedProcedure |
| `status-pages` | list, get, create, update, delete, setPassword | writeProcedure |
| `maintenance` | list, get, create, update, delete | writeProcedure |
| `subscribers` | list, delete | writeProcedure |
| `status-updates` | list, create, delete | writeProcedure |
| `configuration` | get, update | admin only |
| `tags` | list, create, delete | writeProcedure |

---

### `packages/db/` — Schema e Clientes de Banco

```
packages/db/
└── src/
    ├── index.ts                    ← export do db (Drizzle + postgres)
    ├── clickhouse.ts               ← Proxy pattern com lazy schema init
    ├── migrate.ts                  ← runner de migrations
    ├── schema/
    │   ├── auth.ts                 ← user, session, account, verification
    │   ├── monitors.ts             ← monitor, monitorTag, monitorRegion
    │   ├── incidents.ts            ← incident, incidentMonitor, comment
    │   ├── maintenance.ts          ← maintenancePeriod, maintenanceMonitor
    │   ├── status-pages.ts         ← statusPage, statusPageMonitor
    │   ├── status-updates.ts       ← statusUpdate
    │   ├── integrations.ts         ← integrationConfig
    │   ├── workers.ts              ← worker, workerApiKey
    │   ├── ssl-notifications.ts    ← sslNotification
    │   ├── configuration.ts        ← globalConfiguration
    │   ├── tags.ts                 ← tag
    │   └── subscribers.ts         ← subscriber
    └── migrations/                 ← SQL migrations numerados
```

**ClickHouse — tabelas:**

| Tabela | Engine | ORDER BY | Uso |
|---|---|---|---|
| `uptimekit.monitor_events` | MergeTree | (monitorId, timestamp) | Série temporal de checks |
| `uptimekit.monitor_changes` | MergeTree | (monitorId, timestamp) | Transições de status |

**PostgreSQL — tabelas:**

| Tabela | Propósito |
|---|---|
| `user` / `session` / `account` | Better Auth (usuários e sessões) |
| `monitor` | Configuração de cada monitor |
| `incident` | Incidentes ativos e histórico |
| `maintenance_period` | Janelas de manutenção agendadas |
| `status_page` | Páginas de status públicas |
| `status_update` | Posts de atualização manual |
| `integration_config` | Configurações de integrações por org |
| `worker` / `worker_api_key` | Workers e suas chaves SHA-256 |
| `ssl_notification` | Controle de throttle de alertas SSL |
| `global_configuration` | Configurações globais (retention, etc.) |
| `tag` | Tags para agrupar monitors |
| `subscriber` | Inscrições de notificação |

---

### `packages/auth/` — Autenticação (Better Auth)

```
packages/auth/
└── src/
    └── index.ts                    ← betterAuth() configurado com:
                                       - drizzleAdapter (PostgreSQL)
                                       - plugins: organization, twoFactor,
                                         apiKey, openAPI
                                       - OAuth2 providers (configurável)
```

**Capacidades:**

| Feature | Implementação |
|---|---|
| Sessões | Cookie HTTP-only + DB session |
| Organizações | Multi-tenant com roles: owner, admin, member |
| 2FA | TOTP (Google Authenticator, etc.) |
| API Keys | Geração e validação para acesso programático |
| OAuth2 | Providers configuráveis (Google, GitHub, etc.) |
| Convites | Email invite com token temporário |

---

### `packages/scheduler/` — Jobs Periódicos (BullMQ)

```
packages/scheduler/
└── src/
    ├── index.ts                    ← BullMQ Queue + Worker init
    │                                  upsertJobScheduler() para cada job
    └── jobs/
        ├── maintenance-processor.ts ← scheduled→in_progress→completed (cron 1min)
        ├── data-retention.ts        ← DELETE ClickHouse rows > N dias (cron 2AM)
        └── config-integrity.ts      ← validação de configurações
```

**Jobs:**

| Job | Cron | Propósito |
|---|---|---|
| `maintenance-processor` | `* * * * *` (1 min) | Transição de estados de manutenção |
| `data-retention` | `0 2 * * *` (2AM diário) | Purga dados antigos no ClickHouse |
| `config-integrity` | configurável | Verifica integridade de configurações |

---

### `packages/config/` — Configuração Compartilhada

```
packages/config/
└── src/
    └── env.ts                      ← env vars tipadas (DATABASE_URL, REDIS_URL, etc.)
```

Exporta também `tsconfig.base.json` usado por todos os outros packages.

---

## Diagrama de Dependências entre Packages

```
apps/dash
    ├── packages/api
    ├── packages/auth
    ├── packages/db
    └── packages/config

apps/status-page
    ├── packages/api
    ├── packages/db
    └── packages/config

apps/worker  ←── Go, sem dependência nos packages TS

packages/scheduler
    ├── packages/db
    └── packages/config

packages/api
    ├── packages/auth
    ├── packages/db
    └── (ioredis, nodemailer, @clickhouse/client)

packages/auth
    └── packages/db

packages/db
    └── (drizzle-orm, postgres, @clickhouse/client)

packages/config
    └── (dotenv)
```

---

## Variáveis de Ambiente

| Variável | Usado por | Propósito |
|---|---|---|
| `DATABASE_URL` | db, dash, scheduler | PostgreSQL connection string |
| `CLICKHOUSE_URL/USER/PASSWORD` | db, status-page | ClickHouse analytics |
| `REDIS_URL` | dash, status-page, scheduler | Cache + BullMQ |
| `BETTER_AUTH_SECRET` | auth | Assinatura de sessões e tokens |
| `BETTER_AUTH_URL` | auth | Base URL do servidor de auth |
| `NEXT_PUBLIC_URL` | dash | URL pública do dashboard |
| `NEXT_PUBLIC_STATUS_PAGE_DOMAIN` | status-page | Domínio padrão das status pages |
| `STATUS_PAGE_ACCESS_SECRET` | status-page | HMAC para tokens de acesso por senha |
| `EMAIL_PROVIDER` | api | `"resend"` ou `"smtp"` |
| `RESEND_API_KEY` | api | Chave da API Resend |
| `SMTP_*` | api | Configuração SMTP alternativa |
| `WORKER_API_KEY` | apps/worker | Autenticação do worker Go |
| `DASHBOARD_URL` | apps/worker | URL do dash que o worker acessa |
| `CHECK_INTERVAL` | apps/worker | Frequência de checks em segundos |
| `DASH_PORT` | dash | Porta do servidor Next.js (padrão 3000) |
| `STATUS_PAGE_PORT` | status-page | Porta do servidor (padrão 3001) |
| `NEXT_PUBLIC_SELFHOSTED` | dash | Habilita features de self-host |
