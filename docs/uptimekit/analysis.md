# UptimeKit — Análise Geral

> **Versão analisada:** 3.0.2  
> **Data da análise:** 2026-04-15  
> **Diretório:** `otel/uptimekit/`

---

## 1. Visão Geral e Propósito

**UptimeKit** é uma plataforma open-source de monitoramento de uptime e gerenciamento de páginas de status. É uma solução self-hosted, tipo SaaS, que permite às organizações:

- Monitorar a disponibilidade de serviços HTTP/TCP/ICMP/DNS
- Criar e gerenciar páginas de status públicas customizáveis
- Gerenciar incidentes e manutenções programadas
- Notificar usuários por email, Slack, Discord e webhooks
- Analisar métricas e histórico de uptime
- Suportar múltiplas organizações (multi-tenant)

---

## 2. Estrutura de Diretórios

```
uptimekit/
├── apps/
│   ├── dash/              # Dashboard principal (Next.js 16) — porta 3000
│   ├── status-page/       # Página de status pública (Next.js 16) — porta 3001
│   └── worker/            # Worker de monitoramento (Go) — DESCONTINUADO
├── packages/
│   ├── api/               # Lógica compartilhada de API (oRPC)
│   ├── auth/              # Autenticação (Better Auth)
│   ├── db/                # Schema Drizzle ORM + ClickHouse
│   ├── scheduler/         # Job scheduling (BullMQ + Redis)
│   └── config/            # Configuração compartilhada
├── .github/               # GitHub Actions + templates
├── scripts/               # Scripts auxiliares
├── docker-compose.yml     # Orquestração local
└── turbo.json             # Configuração Turborepo
```

---

## 3. Tecnologias e Dependências Principais

| Categoria | Tecnologia |
|---|---|
| Framework Web | Next.js 16 (App Router) + React 19 |
| Linguagem | TypeScript 5.9 |
| Banco Transacional | PostgreSQL 17 + Drizzle ORM |
| Banco Time-Series | ClickHouse |
| Cache / Fila | Redis 8.0 + BullMQ |
| Autenticação | Better Auth (OAuth2, 2FA TOTP, API Keys) |
| API | oRPC (RPC TypeScript-first com OpenAPI) |
| Validação | Zod |
| UI | Radix UI + shadcn/ui + TailwindCSS 4.2 |
| Gráficos | Recharts |
| Mapas | MapLibre GL |
| Package Manager | Bun 1.3.11 |
| Monorepo | Turborepo |
| Linter/Formatter | Biome |
| Email | Resend API ou SMTP |
| Worker (checks) | Go (descontinuado) |

---

## 4. Arquitetura e Fluxo de Dados

### 4.1 Visão Geral

```
┌──────────────────────────────────────────────────────────┐
│                     Cliente/Browser                      │
│     (Dashboard — apps/dash ou Status Page — apps/status) │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTP/RPC
┌─────────────────────────▼────────────────────────────────┐
│               Next.js Backend (apps/dash)                │
│  ┌───────────────────────────────────────────────────┐   │
│  │  API Routes & oRPC Handlers (/api/rpc/...)       │   │
│  │  /api/worker/heartbeat — workers buscam monitors │   │
│  │  /api/worker/events    — workers enviam resultados│   │
│  │  /api/auth/[...all]    — Better Auth             │   │
│  └───────────────────────────────────────────────────┘   │
└──────────┬────────────────┬────────────────┬─────────────┘
           │                │                │
     ┌─────▼──────┐  ┌──────▼──────┐  ┌────▼─────┐
     │ PostgreSQL │  │ ClickHouse  │  │  Redis   │
     │(transacional)│ │(time-series)│  │(cache)   │
     └────────────┘  └─────────────┘  └──────────┘
```

### 4.2 Fluxo de Monitoramento

```
Worker (Go)
  1. POST /api/worker/heartbeat → recebe lista de monitors ativos
  2. Executa checks concorrentes (HTTP, TCP, DNS, ICMP...)
  3. POST /api/worker/events → envia resultados

Dashboard (processMonitorEvents)
  1. Busca último status no ClickHouse
  2. Detecta mudança de status
  3. Persiste em PostgreSQL (monitor_changes) e ClickHouse
  4. Cria/resolve incidentes automaticamente
  5. Emite eventos (incident.created, incident.resolved, ...)
  6. IntegrationService dispara webhooks e emails
```

### 4.3 Fluxo de Incidentes

```
Evento DOWN recebido:
  → Se status anterior era UP:
      → Aguarda incidentPendingDuration
      → Se continuar DOWN → Cria incidente
      → Se voltar UP → Cancela

Evento UP recebido:
  → Se há incidente aberto → Resolve
  → Emite "incident.resolved"
  → Notifica todas as integrações configuradas
```

---

## 5. Funcionalidades Principais

### 5.1 Tipos de Monitor

| Tipo | Descrição |
|---|---|
| HTTP/HTTPS | Verifica status code, body, headers |
| TCP | Conectividade em porta específica |
| ICMP/Ping | Conectividade de rede |
| DNS | Resolução de domínios |
| HTTP-JSON | Valida campos JSON na resposta |
| Keyword | Busca texto na resposta |

**Configurações:** intervalo, timeout, múltiplas localizações de workers, tags, grouping, verificação de certificado SSL.

### 5.2 Páginas de Status

- URL pública com slug customizado
- Suporte a domínios customizados
- Proteção por password (opcional)
- Design customizável (cores, logos, CSS)
- Grouping de monitors
- Subscription por email, Slack, Discord

### 5.3 Incidentes

**Estados:** `investigating` → `identified` → `monitoring` → `resolved`

**Severidade:** `minor`, `major`, `critical`

**Tipos:** `manual` (criado pelo usuário) ou `automatic` (criado pelo sistema)

**Recursos:** descrição em Markdown, acknowledgment, activity log, associação com monitors e status pages.

### 5.4 Manutenção Programada

- Agendamento futuro
- Estados: `scheduled` → `in_progress` → `completed`
- Transição automática via scheduler job (cron a cada minuto)
- Associação com monitors e status pages

### 5.5 Notificações e Integrações

**Event Bus — Eventos:**
- `incident.created`
- `incident.acknowledged`
- `incident.resolved`
- `incident.comment_added`
- `incident.deleted`
- `monitor.ssl.expiring`

**Integrações:**
- Discord (webhooks)
- Slack (webhooks)
- Telegram (bot)
- AlertManager (Prometheus-compatible)
- Webhooks genéricos
- Email (Resend ou SMTP)

---

## 6. API (oRPC + OpenAPI)

### 6.1 Routers Principais

```typescript
const appRouter = {
  workers,       // Gerenciamento de workers
  monitors,      // CRUD de monitors + queries de status
  incidents,     // Gerenciamento de incidentes
  statusPages,   // Configuração de páginas de status
  statusUpdates, // Relatórios de status
  maintenance,   // Manutenção programada
  integrations,  // Configuração de integrações
  configuration, // Configuração global
  users,         // Gerenciamento de usuários
  organizations, // Gerenciamento de organizações
};
```

### 6.2 Rotas Especiais do Dashboard

```
POST /api/worker/heartbeat        — Worker busca monitors ativos
POST /api/worker/events           — Worker envia resultados de checks
GET  /api/worker/cert/[monitorId] — Validação de certificado SSL
POST /api/webhooks/integrations/[id] — Receiver de webhooks externos
GET  /api/health                  — Health check
GET  /api/rpc/api-reference       — Documentação OpenAPI
```

### 6.3 Níveis de Acesso

| Procedure | Requerimento |
|---|---|
| `publicProcedure` | Sem autenticação |
| `protectedProcedure` | Sessão válida (usuário autenticado) |
| `writeProcedure` | Sessão + organização ativa + role `admin`/`owner` |
| `adminProcedure` | Sessão + role global `admin` |

---

## 7. Banco de Dados

### 7.1 PostgreSQL — Tabelas Principais

| Tabela | Propósito |
|---|---|
| `monitor` | Configuração dos monitors |
| `monitor_group` | Grupos de monitors |
| `monitor_tag` | Tags dos monitors |
| `incident` | Dados de incidentes |
| `incident_monitor` | Monitors afetados por incidente |
| `incident_activity` | Timeline de atividades |
| `maintenance` | Manutenções programadas |
| `status_page` | Configuração das páginas de status |
| `status_page_monitor` | Monitors associados às páginas |
| `status_page_email_subscribers` | Subscribers por email |
| `worker` | Workers registrados |
| `worker_api_key` | Autenticação dos workers |

### 7.2 ClickHouse — Tabelas de Time-Series

**`uptimekit.monitor_events`** — Eventos brutos de cada check:
```sql
id, monitorId, status, latency, timestamp,
statusCode, error, location,
dnsLookup, tcpConnect, tlsHandshake, ttfb, transfer
```

**`uptimekit.monitor_changes`** — Mudanças de status:
```sql
id, monitorId, status, timestamp, location
```

Ambas usam `ENGINE = MergeTree()`, ordenadas por `(monitorId, timestamp)`.

---

## 8. Scheduler (packages/scheduler)

Dois jobs gerenciados via BullMQ + Redis:

| Job | Schedule | Função |
|---|---|---|
| `maintenance-processor` | `* * * * *` (todo minuto) | Transiciona status de manutenções automaticamente |
| `data-retention` | `0 2 * * *` (02:00 AM) | Limpeza de dados antigos no ClickHouse |

---

## 9. Autenticação (Better Auth)

**Features:**
- Email/Password com registro e login
- OAuth2 (Discord, GitHub)
- 2FA com TOTP
- API Keys com rate limiting
- Organization management com roles (`owner`, `admin`, `member`)

**Hooks ao criar usuário:**
1. Verifica se é convidado via token de convite
2. Se registro desabilitado (`ENABLE_REGISTRATION=false`), rejeita
3. Se for o primeiro usuário do sistema, promove a admin global
4. Cria organização padrão (slug baseado no email)

---

## 10. Configuração e Ambiente

### 10.1 Variáveis de Ambiente Principais

```env
# Banco de Dados
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uptimekit

# Autenticação
BETTER_AUTH_SECRET=<secret-key>
BETTER_AUTH_URL=http://localhost:3000

# Aplicação
NEXT_PUBLIC_SELFHOSTED=true
NEXT_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_STATUS_PAGE_DOMAIN=status.uptimekit.com

# ClickHouse
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# Redis
REDIS_URL=redis://localhost:6379

# Email
EMAIL_PROVIDER=resend|smtp
EMAIL_FROM="UptimeKit <status@example.com>"
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false

# Worker
WORKER_API_KEY=<worker-api-key>

# OAuth (opcional)
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Feature Flags
ENABLE_REGISTRATION=true
```

### 10.2 Serviços Docker Compose

| Serviço | Porta | Função |
|---|---|---|
| `dash` | 3000 | Dashboard Next.js |
| `status-page` | 3001 | Página de status pública |
| `scheduler` | — | Job processor |
| `db` | 5432 | PostgreSQL 17 |
| `redis` | 6379 | Redis 8.0 |
| `clickhouse` | 8123 | ClickHouse |

---

## 11. Segurança

- **API Keys de workers** armazenadas com hash SHA-256
- **Rate limiting** via Redis (ex: 10 tentativas/24h para subscription)
- **SSRF protection** — `packages/api/src/lib/safe-url.ts` valida webhooks e rejeita URLs locais
- **2FA** com TOTP
- **Password protection** para status pages privadas via JWT em cookie
- **Role-based access** com verificação em todos os procedimentos write/admin

---

## 12. Observações Importantes

1. **Worker Go está descontinuado** — o README sugere alternativas como *pongo* ou *openstatus* para execução dos checks.
2. **Multi-tenant por design** — toda entidade tem `organizationId`; suporte completo a múltiplas orgs com quotas configuráveis.
3. **Arquitetura event-driven** — notificações desacopladas via EventBus interno.
4. **Type-safe end-to-end** — Zod para validação de runtime, oRPC para tipos no cliente, Drizzle para tipos no banco.
5. **API-first** — documentação OpenAPI gerada automaticamente em `/api/rpc/api-reference`.
6. **Workers distribuídos** — múltiplas localizações geográficas suportadas; dados filtráveis por `location`.
7. **Self-hosted focus** — Docker Compose completo com todos os serviços necessários.
