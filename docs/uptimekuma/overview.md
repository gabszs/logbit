# Uptime Kuma — Análise da Integração loglog

> Localização: `/otel/uptime-kuma`
> Versão: **2.2.1** | Licença: MIT
> Upstream: [louislam/uptime-kuma](https://github.com/louislam/uptime-kuma)

---

## O que é

Uptime Kuma é uma plataforma de monitoramento self-hosted, moderna e de código aberto. Dentro do projeto loglog, ela está posicionada na pasta `otel/`, servindo como componente de monitoramento de uptime com exportação nativa de métricas no formato Prometheus — o que a torna compatível com o stack de observabilidade do projeto.

**Responsabilidade principal no loglog:** monitorar endpoints, serviços e infraestrutura, expondo métricas via `/metrics` para ingestão pelo Prometheus/Grafana.

---

## Stack tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js ≥ 20.4, Express 4, Socket.io 4 |
| Frontend | Vue 3, Vite 5, Bootstrap 5, Chart.js 4 |
| ORM/DB | Redbean-node, Knex.js |
| Bancos suportados | SQLite (padrão), MySQL, PostgreSQL, MongoDB, Oracle, MSSQL |
| Métricas | prom-client, prometheus-api-metrics |
| Deploy | Docker, PM2 (ecosystem.config.js) |
| Testes | Node.js native test runner (unit) + Playwright (E2E) |

---

## Estrutura de diretórios

```
otel/uptime-kuma/
├── server/                  # Backend Node.js/Express
│   ├── server.js            # Entry point (~2000 linhas)
│   ├── uptime-kuma-server.js# Classe principal (singleton)
│   ├── prometheus.js        # Exportação de métricas Prometheus
│   ├── database.js          # Abstração multi-banco (~35KB)
│   ├── notification.js      # Dispatcher de notificações
│   ├── uptime-calculator.js # Cálculo de uptime (~29KB)
│   ├── auth.js              # Autenticação JWT + 2FA
│   ├── model/               # Modelos de dados (ORM)
│   │   ├── monitor.js       # Modelo principal (~84KB)
│   │   ├── heartbeat.js     # Rastreamento de batimentos
│   │   ├── status_page.js   # Páginas de status
│   │   ├── maintenance.js   # Janelas de manutenção
│   │   └── ...              # user, api_key, proxy, tag, etc.
│   ├── monitor-types/       # 23+ implementações de monitor
│   ├── socket-handlers/     # Handlers WebSocket (10 arquivos)
│   ├── notification-providers/ # 93 provedores de notificação
│   ├── routers/             # Rotas REST
│   └── jobs/                # Jobs periódicos (limpeza, vacuum)
├── src/                     # Frontend Vue 3
│   ├── pages/               # 15 páginas principais
│   ├── components/          # 40+ componentes reutilizáveis
│   └── lang/                # i18n (20+ idiomas)
├── db/                      # Banco e migrações
│   ├── kuma.db              # Template SQLite
│   └── knex_migrations/     # Migrações (Knex.js, 20+ arquivos)
├── docker/                  # Dockerfiles (produção, dev, go healthcheck)
├── extra/                   # Scripts utilitários e exemplos push
├── test/                    # Testes unitários e E2E
├── compose.yaml             # Docker Compose (quickstart)
├── ecosystem.config.js      # PM2 config
└── package.json             # Manifesto v2.2.1
```

---

## Tipos de monitor suportados

| Categoria | Tipos |
|-----------|-------|
| Web | HTTP/HTTPS, WebSocket, gRPC |
| Rede | TCP, DNS, Ping, SNMP |
| Bancos de dados | MongoDB, MySQL, PostgreSQL, Oracle, MSSQL, Redis |
| Mensageria | MQTT, Kafka, RabbitMQ |
| Infraestrutura | Docker container, System service |
| Especiais | Real Browser (Playwright), Push, Game Server (GameDig), Tailscale, SIP, GlobalPing, Manual |

---

## Integração com observabilidade (Prometheus)

O arquivo `server/prometheus.js` expõe métricas no endpoint `/metrics`. Estas são as métricas disponíveis por monitor:

| Métrica | Descrição |
|---------|-----------|
| `monitor_status` | Status atual (UP=1, DOWN=0, PENDING=2, MAINTENANCE=3) |
| `monitor_response_time` | Tempo de resposta em ms |
| `monitor_response_time_seconds` | Tempo médio (janelas: 1d / 30d / 365d) |
| `monitor_uptime_ratio` | Proporção de uptime (0.0–1.0, mesmas janelas) |
| `monitor_cert_days_remaining` | Dias restantes do certificado SSL |
| `monitor_cert_is_valid` | Certificado válido (1) ou não (0) |

**Labels presentes em todas as métricas:**
`monitor_id`, `monitor_name`, `monitor_type`, `monitor_url`, `monitor_hostname`, `monitor_port`, `tags`

> Não há integração direta com OpenTelemetry SDK (`@opentelemetry/*`). A integração com o stack OTel do loglog ocorre via scraping Prometheus → Collector → backends.

---

## Arquitetura do backend

### Fluxo principal

```
server.js (inicialização)
  ├── Express (HTTP/HTTPS server)
  ├── Socket.io (WebSocket para real-time)
  ├── Database.js (conexão multi-banco)
  ├── Prometheus.js (métricas)
  ├── Monitor (model/monitor.js)
  │   └── monitor-types/* (execução dos checks)
  ├── UptimeCalculator (cálculo de uptime)
  ├── Notification.js → notification-providers/*
  └── socket-handlers/* (eventos WebSocket do dashboard)
```

### Comunicação

- Dashboard usa **WebSocket (Socket.io)** para atualizações em tempo real — sem polling HTTP
- API REST disponível para integrações externas (`/api-router.js`)
- Autenticação via JWT + suporte a 2FA e API Keys

---

## Frontend Vue 3

### Páginas principais

| Página | Função |
|--------|--------|
| `DashboardHome.vue` | Visão geral de todos os monitores |
| `EditMonitor.vue` (212KB) | Criação/edição de monitores (20+ tipos) |
| `Details.vue` | Detalhes e histórico de um monitor |
| `StatusPage.vue` | Página de status pública |
| `Settings.vue` | Configurações da aplicação |
| `ManageMaintenance.vue` | Agendamento de janelas de manutenção |

### Componentes de destaque

- `HeartbeatBar.vue` — barra de uptime visual (últimas 24h+)
- `PingChart.vue` — gráfico de tempo de resposta
- `MonitorList.vue` — lista com filtros por status, grupo e tag
- `NotificationDialog.vue` — configuração dos 90+ provedores

---

## Banco de dados e migrações

- **Padrão:** SQLite em `./data/kuma.db`
- Migrações gerenciadas por Knex.js em `db/knex_migrations/`
- Migrações recentes (2025):
  - `2025-01-01` — suporte a monitoramento SMTP
  - `2025-02-15` — WebSocket testing
  - `2025-02-17` — analytics generalizado
  - `2025-03-04` — opções avançadas de ping

**Tabelas principais:** `monitors`, `heartbeats`, `incidents`, `status_pages`, `users`, `notifications`, `proxies`, `tags`, `docker_hosts`, `api_keys`, `maintenances`, `domain_expiry_info`

---

## Notificações

93 provedores de notificação disponíveis, incluindo:
- Mensageiros: Telegram, Discord, Slack, WhatsApp, Signal
- Email: SMTP nativo via Nodemailer
- Push: Web Push, Pushover, Ntfy, Gotify
- Incident: PagerDuty, OpsGenie, VictorOps
- e muitos outros via [Apprise](https://github.com/caronc/apprise)

---

## Deploy

### Docker Compose (recomendado)

```yaml
# compose.yaml (já presente no repositório)
services:
  uptime-kuma:
    image: louislam/uptime-kuma:2
    restart: unless-stopped
    volumes:
      - ./data:/app/data
    ports:
      - "3001:3001"
```

### PM2 (sem Docker)

```bash
npm run setup
npm start          # usa ecosystem.config.js
```

### Plataformas Docker

`linux/amd64`, `linux/arm64`, `linux/arm/v7`

---

## Scripts npm principais

| Script | Ação |
|--------|------|
| `npm run dev` | Desenvolvimento (Vite + Node watch simultâneos) |
| `npm start` | Servidor de produção |
| `npm run build` | Build do frontend (Vite) |
| `npm test` | Todos os testes (unit + E2E Playwright) |
| `npm run lint` | ESLint + Stylelint |
| `npm run fmt` | Formatação com Prettier |
| `npm run setup` | Instalação para produção |

---

## Funcionalidades de segurança

- Autenticação com senha (bcrypt)
- 2FA (TOTP)
- API Keys com escopos
- Rate limiting
- Suporte a proxies HTTP/SOCKS
- Autenticação NTLM e RADIUS
- Healthcheck no container

---

## Observações para o contexto loglog

1. **Sem SDK OTel direto** — a integração com o pipeline OTel do loglog se dá via scraping do endpoint `/metrics` (Prometheus format)
2. **Posicionamento** — está em `otel/` junto com outras ferramentas de observabilidade (Grafana, HyperDX, etc.), funcionando como fonte de dados de uptime
3. **Métricas granulares** — as janelas de 1d/30d/365d e os labels detalhados permitem dashboards ricos no Grafana
4. **Self-contained** — o projeto é uma fork funcional completa, não apenas um plugin; pode ser rodado de forma independente
