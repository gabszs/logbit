# Uptime Kuma — Sistema de Notificações

> Baseado em `server/notification.js`, `server/notification-providers/`, `src/components/notifications/`
> 92 provedores suportados (Slack, Telegram, SMTP, PagerDuty, Discord, Webhook, etc.)

---

## Resposta direta: factory ou registry?

**Registry estático — não factory.**

Não há dynamic imports, não há `require()` em runtime, não há plugin loader. Ao iniciar o servidor, todos os 92 provedores são importados no topo do arquivo e instanciados manualmente em uma lista dentro de `Notification.init()`. O lookup é feito por nome via objeto chave-valor (`providerList[notification.type]`).

---

## Arquitetura em três camadas

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND                                               │
│  src/components/notifications/index.js                  │
│    NotificationFormList = { slack: Slack.vue, ... }     │
│    └─► carrega componente Vue dinamicamente por tipo    │
│         └─► cada .vue faz v-model em $parent.notification│
└────────────────────────────┬────────────────────────────┘
                             │ WebSocket / REST
┌────────────────────────────▼────────────────────────────┐
│  DISPATCHER                                             │
│  server/notification.js                                 │
│    Notification.init()  → providerList[name] = instance │
│    Notification.send()  → providerList[type].send(...)  │
└────────────────────────────┬────────────────────────────┘
                             │ herança
┌────────────────────────────▼────────────────────────────┐
│  PROVEDORES                                             │
│  server/notification-providers/                         │
│    notification-provider.js  ← base class               │
│    slack.js                  ← extends NotificationProvider│
│    telegram.js               ← extends NotificationProvider│
│    smtp.js                   ← extends NotificationProvider│
│    ... (92 provedores)                                  │
└─────────────────────────────────────────────────────────┘
```

---

## A classe base: `NotificationProvider`

**Arquivo:** `server/notification-providers/notification-provider.js`

É a única abstração compartilhada. Define o contrato que todo provedor deve cumprir:

```javascript
class NotificationProvider {
    name = undefined;  // identificador único — OBRIGATÓRIO

    // contrato principal — cada provedor sobrescreve este método
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        throw new Error("Not implemented");
    }

    // helpers disponíveis para todos os provedores:
    renderTemplate(template, msg, monitorJSON, heartbeatJSON)  // Liquid.js
    extractAddress(monitorJSON)   // extrai host/URL pelo tipo do monitor
    getAxiosConfigWithProxy(cfg)  // injeta proxy HTTP se env var configurada
    throwGeneralAxiosError(error) // formata erros axios para exibição ao usuário
}
```

### Contrato do método `send()`

| Parâmetro | Tipo | Conteúdo |
|-----------|------|----------|
| `notification` | objeto (deserializado do JSON do banco) | todos os campos de config do provedor — ex.: `notification.slackwebhookURL` |
| `msg` | string | mensagem de alerta formatada — ex.: `[api] 🔴 Down - Connection refused` |
| `monitorJSON` | objeto ou null | dados do monitor: `name`, `url`, `hostname`, `type`, `tags`, etc. |
| `heartbeatJSON` | objeto ou null | resultado do check: `status`, `msg`, `time`, `timezone`, `ping`, `lastDownTime` |
| **retorno** | `Promise<string>` | mensagem de sucesso — ex.: `"Sent Successfully."` |
| **erro** | throw `Error` | qualquer falha — capturada pelo dispatcher |

---

## O dispatcher: `notification.js`

### `Notification.init()` — registro em startup

```javascript
// server/notification.js (simplificado)

const Slack = require("./notification-providers/slack");
const Telegram = require("./notification-providers/telegram");
const SMTP = require("./notification-providers/smtp");
// ... 92 imports

static init() {
    let list = [
        new Slack(),
        new Telegram(),
        new SMTP(),
        // ... 92 instâncias
    ];

    for (let provider of list) {
        if (!provider.name) throw new Error("Provider missing name");
        if (providerList[provider.name]) throw new Error("Duplicate name: " + provider.name);
        providerList[provider.name] = provider;
    }
}
```

O registry final é um objeto simples:
```javascript
providerList = {
    "slack":    SlackInstance,
    "telegram": TelegramInstance,
    "smtp":     SMTPInstance,
    // ...
}
```

### `Notification.send()` — dispatch

```javascript
static async send(notification, msg, monitorJSON, heartbeatJSON) {
    let provider = providerList[notification.type];

    if (!provider) {
        throw new Error("Notification type is not supported: " + notification.type);
    }

    return await provider.send(notification, msg, monitorJSON, heartbeatJSON);
}
```

Lookup O(1). Sem switch/case, sem if-else encadeado.

### Como o monitor aciona as notificações

```javascript
// model/monitor.js — no final do beat()
let notificationList = await R.getAll(`
    SELECT notification.*
    FROM notification, monitor_notification
    WHERE monitor_notification.monitor_id = ?
      AND monitor_notification.notification_id = notification.id
`, [this.id]);

for (let notificationItem of notificationList) {
    let notificationConfig = JSON.parse(notificationItem.config);
    await Notification.send(notificationConfig, msg, monitorJSON, heartbeatJSON);
}
```

---

## Como um provedor é implementado

### Exemplo mínimo: Gotify (webhook simples)

```javascript
// server/notification-providers/gotify.js
const NotificationProvider = require("./notification-provider");
const axios = require("axios");

class Gotify extends NotificationProvider {
    name = "gotify";

    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        try {
            await axios.post(`${notification.gotifyserverurl}/message`, {
                title: "Uptime Kuma Alert",
                message: msg,
                priority: notification.gotifyPriority ?? 8,
            }, {
                params: { token: notification.gotifyapplicationToken },
                ...this.getAxiosConfigWithProxy({}),
            });
            return "Sent Successfully.";
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = Gotify;
```

### Exemplo com template Liquid: Slack

```javascript
class Slack extends NotificationProvider {
    name = "slack";

    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        // monta payload base
        let data = { text: msg };

        // suporte a template customizado via Liquid.js
        if (notification.slackUseTemplate && notification.slackTemplate) {
            let rendered = await this.renderTemplate(
                notification.slackTemplate, msg, monitorJSON, heartbeatJSON
            );
            data = JSON.parse(rendered);  // template deve ser JSON válido
        } else if (notification.slackrichmessage) {
            data = this.buildRichMessage(notification, monitorJSON, heartbeatJSON);
        }

        await axios.post(notification.slackwebhookURL, data,
            this.getAxiosConfigWithProxy({})
        );
        return "Sent Successfully.";
    }
}
```

### Exemplo com nodemailer: SMTP

```javascript
class SMTP extends NotificationProvider {
    name = "smtp";

    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        let transporter = nodemailer.createTransport({
            host:   notification.smtpHost,
            port:   notification.smtpPort,
            secure: notification.smtpSecure,
            auth: notification.smtpUsername ? {
                user: notification.smtpUsername,
                pass: notification.smtpPassword,
            } : undefined,
            // DKIM signing se configurado
            dkim: notification.smtpDkimDomain ? {
                domainName:   notification.smtpDkimDomain,
                keySelector:  notification.smtpDkimKeySelector,
                privateKey:   notification.smtpDkimPrivateKey,
            } : undefined,
        });

        // suporte a template Liquid para subject e body
        let subject = notification.customSubject
            ? await this.renderTemplate(notification.customSubject, msg, monitorJSON, heartbeatJSON)
            : `Uptime Kuma Alert: ${monitorJSON?.name}`;

        await transporter.sendMail({
            from: notification.smtpFrom,
            to:   notification.smtpTo,
            cc:   notification.smtpCC,
            bcc:  notification.smtpBCC,
            subject,
            html: notification.htmlBody ? body : undefined,
            text: notification.htmlBody ? undefined : body,
        });

        return "Sent Successfully.";
    }
}
```

---

## Como os campos de config são armazenados

Não há schema formal. O objeto de configuração inteiro é serializado como JSON e salvo na coluna `config` da tabela `notification`:

```javascript
// ao salvar:
bean.type   = notification.type    // "slack"
bean.config = JSON.stringify(notification)

// ao enviar:
let config = JSON.parse(notificationItem.config)
// config.slackwebhookURL, config.telegramBotToken, etc.
```

**Convenção de nomeação dos campos** (não enforçada, apenas convenção):
- Prefixo com o nome do provedor: `slack*`, `telegram*`, `smtp*`, `pagerduty*`
- camelCase: `slackwebhookURL`, `telegramBotToken`, `smtpIgnoreTLSError`

Não há validação no momento do save. Erros de config aparecem apenas quando a notificação é enviada.

---

## Perfil dos provedores analisados

| Provedor | Mecanismo HTTP | Campos principais | Destaques |
|----------|----------------|-------------------|-----------|
| **Slack** | axios POST webhook | `slackwebhookURL`, `slackchannel` | rich messages, Liquid templates, group name inclusion |
| **Telegram** | axios POST API | `telegramBotToken`, `telegramChatID` | Markdown V2 escaping, thread ID, template |
| **Discord** | axios POST webhook | `discordWebhookUrl`, `discordUsername` | 3 formatos (minimalist/normal/custom), forum post support |
| **SMTP** | nodemailer | `smtpHost`, `smtpPort`, `smtpFrom`, `smtpTo` | DKIM, TLS, STARTTLS, HTML body, templates |
| **PagerDuty** | axios POST API | `pagerdutyIntegrationKey` | severity mapping, auto-resolve, event routing |
| **Webhook** | axios GET/POST | `webhookURL`, `httpMethod`, `webhookContentType` | headers customizados, body template, form-data |
| **Pushover** | axios POST API | `pushoveruserkey`, `pushoverapptoken` | device targeting, priority, retry/expire |
| **Gotify** | axios POST | `gotifyserverurl`, `gotifyapplicationToken` | config mínima, prioridade numérica |

---

## Frontend: como o formulário correto aparece

**Arquivo:** `src/components/notifications/index.js`

```javascript
import Slack from "./Slack.vue";
import Telegram from "./Telegram.vue";
// ...

export const NotificationFormList = {
    slack:    Slack,
    telegram: Telegram,
    smtp:     SMTP,
    // ... 92 entradas
};
```

O componente pai usa `<component :is="NotificationFormList[notification.type]" />` para renderizar o formulário correto dinamicamente.

Cada `.vue` escreve diretamente nos campos do objeto:

```vue
<!-- src/components/notifications/Slack.vue -->
<input v-model="$parent.notification.slackwebhookURL" required />
<input v-model="$parent.notification.slackchannel" />
<input v-model="$parent.notification.slackusername" />
```

O `$parent.notification` é o mesmo objeto que vai ser serializado e salvo no banco.

---

## Como adicionar um novo provedor

São necessárias **4 alterações em 4 arquivos**:

```
1. server/notification-providers/myprovider.js   ← implementação
2. server/notification.js                        ← import + instância na lista
3. src/components/notifications/MyProvider.vue   ← formulário Vue
4. src/components/notifications/index.js         ← registro no frontend
```

**Passo 1 — backend:**
```javascript
// server/notification-providers/myprovider.js
const NotificationProvider = require("./notification-provider");
const axios = require("axios");

class MyProvider extends NotificationProvider {
    name = "myprovider";

    async send(notification, msg, monitorJSON, heartbeatJSON) {
        try {
            await axios.post(notification.myproviderWebhookUrl, { text: msg },
                this.getAxiosConfigWithProxy({})
            );
            return "Sent Successfully.";
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = MyProvider;
```

**Passo 2 — registrar no dispatcher:**
```javascript
// server/notification.js
const MyProvider = require("./notification-providers/myprovider");

// dentro de Notification.init():
new MyProvider(),
```

**Passo 3 — formulário Vue:**
```vue
<!-- src/components/notifications/MyProvider.vue -->
<template>
    <div class="mb-3">
        <label class="form-label">Webhook URL</label>
        <input v-model="$parent.notification.myproviderWebhookUrl"
               type="url" class="form-control" required />
    </div>
</template>
```

**Passo 4 — registrar no frontend:**
```javascript
// src/components/notifications/index.js
import MyProvider from "./MyProvider.vue";

export const NotificationFormList = {
    myprovider: MyProvider,
    // ...
};
```

---

## Validação

Não existe validação centralizada. A estratégia é:

| Camada | Validação | Como |
|--------|-----------|------|
| Frontend | Mínima | HTML5 `required`, `type="url"`, `type="email"` |
| Backend (save) | Nenhuma | Config salvo as-is como JSON |
| Backend (send) | Runtime, dentro do provedor | cada `send()` verifica o que precisa antes de fazer a chamada |

Erros de configuração inválida só aparecem quando a notificação é disparada. O dispatcher captura o `throw` do provedor e loga o erro, sem derrubar o processo do monitor.

---

## Template engine: Liquid.js

Provedores que suportam mensagens customizadas usam o helper da base class:

```javascript
// base class
async renderTemplate(template, msg, monitorJSON, heartbeatJSON) {
    let engine = new Liquid();
    return engine.parseAndRender(template, {
        msg,
        name:     monitorJSON?.name,
        url:      monitorJSON?.url,
        status:   heartbeatJSON?.status === 1 ? "UP" : "DOWN",
        hostname: monitorJSON?.hostname,
        // ...
    });
}
```

Exemplo de template Liquid para o campo de mensagem do Slack:
```
Monitor *{{ name }}* is {{ status }}!
URL: {{ url }}
Time: {{ heartbeat.localDateTime }}
```

---

## Pontos fortes e limitações do design

**Pontos fortes:**
- Padrão previsível — qualquer dev entende em minutos
- Cada provedor é completamente isolado — sem coupling lateral
- Proxy HTTP gratuito para todos via base class
- Template Liquid padronizado para personalização
- Erros de axios normalizados via `throwGeneralAxiosError()`

**Limitações:**
- Registro manual — nenhum sistema de plugins; adicionar um provedor exige tocar 4 arquivos
- Zero validação no save — erros aparecem só no envio
- Campos sem schema — nome ad-hoc por convenção, sem enforcement
- Dessincronização possível — frontend e backend têm registros separados e independentes
- Sem capability discovery — não é possível saber por código quais provedores suportam templates, quais precisam de autenticação, etc.

---

## Schema do banco de dados

> Baseado em `db/knex_init_db.js` e 47 migrations em `db/knex_migrations/`
> ORM: **Knex.js** | Banco: **SQLite** (suporte a MySQL via flag)

### Tabelas principais

#### `user`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| username | VARCHAR(255) | NOT NULL, UNIQUE |
| password | VARCHAR(255) | NULLABLE |
| active | BOOLEAN | DEFAULT: true |
| timezone | VARCHAR(150) | NULLABLE |
| twofa_secret | VARCHAR(64) | NULLABLE |
| twofa_status | BOOLEAN | DEFAULT: false |
| twofa_last_token | VARCHAR(6) | NULLABLE |

#### `monitor`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| name | VARCHAR(150) | NULLABLE |
| active | BOOLEAN | DEFAULT: true |
| user_id | INTEGER UNSIGNED | FK → user(id) |
| interval | INTEGER | DEFAULT: 20 (segundos) |
| url | TEXT | NULLABLE |
| type | VARCHAR(20) | http, ping, dns, port, mqtt, grpc, etc. |
| hostname | VARCHAR(255) | NULLABLE |
| port | INTEGER | NULLABLE |
| keyword | VARCHAR(255) | Para monitors do tipo keyword |
| maxretries | INTEGER | DEFAULT: 0 |
| ignore_tls | BOOLEAN | DEFAULT: false |
| upside_down | BOOLEAN | DEFAULT: false — inverte status |
| maxredirects | INTEGER | DEFAULT: 10 |
| accepted_statuscodes_json | TEXT | DEFAULT: '["200-299"]' |
| retry_interval | INTEGER | DEFAULT: 0 |
| push_token | VARCHAR(32) | Para monitors do tipo push |
| method | TEXT | DEFAULT: "GET" |
| body | TEXT | Corpo HTTP |
| headers | TEXT | Headers HTTP (JSON) |
| basic_auth_user / basic_auth_pass | TEXT | Auth básico |
| proxy_id | INTEGER UNSIGNED | FK → proxy(id) |
| docker_host | INTEGER UNSIGNED | FK → docker_host(id) |
| docker_container | VARCHAR(255) | NULLABLE |
| mqtt_topic / mqtt_username / mqtt_password | TEXT/VARCHAR | Config MQTT |
| database_connection_string | VARCHAR(2000) | Para monitors DB |
| database_query | TEXT | NULLABLE |
| grpc_url / grpc_protobuf / grpc_method | TEXT/VARCHAR | Config gRPC |
| grpc_enable_tls | BOOLEAN | DEFAULT: false |
| tls_ca / tls_cert / tls_key | TEXT | Certificados mTLS |
| parent | INTEGER UNSIGNED | FK → monitor(id) — hierarquia de monitors |
| json_path / expected_value / json_path_operator | TEXT/VARCHAR | Monitors json-query |
| kafka_producer_topic / kafka_producer_brokers | VARCHAR/TEXT | Config Kafka |
| oauth_client_id / oauth_client_secret / oauth_token_url | TEXT | Config OAuth2 |
| timeout | DOUBLE | DEFAULT: 0 |
| conditions | TEXT | DEFAULT: "[]" — condições avançadas |
| remote_browser | INTEGER UNSIGNED | FK → remote_browser(id) |
| manual_status | SMALLINT | Override manual de status |
| save_response | BOOLEAN | DEFAULT: false |
| ping_count / ping_numeric | INTEGER/BOOLEAN | Config ping |
| created_date | DATETIME | DEFAULT: NOW() |

**Tipos de monitor suportados:** http, keyword, json-query, ping, dns, port, gamedig, steam, mqtt, grpc, radius, smtp, docker, snmp, rabbitmq, kafka, real-browser, websocket-upgrade, system-service, tls, rss, manual, sip-options, globalping, tailscale-ping

#### `heartbeat`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| monitor_id | INTEGER UNSIGNED | NOT NULL, FK → monitor(id) CASCADE DELETE |
| status | SMALLINT | 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE |
| msg | TEXT | Mensagem do resultado |
| time | DATETIME | NOT NULL — timestamp do check |
| ping | BIGINT | Latência em ms |
| duration | INTEGER | Duração do estado atual (segundos) |
| down_count | INTEGER | DEFAULT: 0 |
| important | BOOLEAN | DEFAULT: false — marca mudanças de estado |
| retries | INTEGER | DEFAULT: 0 |
| response | TEXT | Corpo da resposta (se save_response=true) |
| end_time | DATETIME | Fim do período DOWN |

**Indexes:** `(monitor_id, time)`, `(monitor_id, important, time)`

#### `notification`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| name | VARCHAR(255) | NULLABLE |
| active | BOOLEAN | NOT NULL |
| user_id | INTEGER UNSIGNED | NULLABLE |
| is_default | BOOLEAN | DEFAULT: false |
| config | LONGTEXT | JSON com toda a config do provedor |

> `config` é o blob JSON que o dispatcher desserializa para chamar o provedor — ver seção "Como os campos de config são armazenados".

#### `proxy`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| user_id | INTEGER UNSIGNED | NOT NULL |
| protocol | VARCHAR(10) | http, socks4, socks5 |
| host | VARCHAR(255) | NOT NULL |
| port | INTEGER | NOT NULL |
| auth | BOOLEAN | NOT NULL |
| username / password | VARCHAR(255) | NULLABLE |
| active | BOOLEAN | DEFAULT: true |
| default | BOOLEAN | DEFAULT: false |

#### `maintenance`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| title | VARCHAR(150) | NOT NULL |
| description | TEXT | NOT NULL |
| user_id | INTEGER UNSIGNED | FK → user(id) |
| active | BOOLEAN | DEFAULT: true |
| strategy | VARCHAR(50) | single, recurring-interval, recurring-weekday, recurring-day-of-month, cron, manual |
| start_date / end_date | DATETIME | Período da manutenção |
| start_time / end_time | TIME | Horário diário (estratégias recorrentes) |
| weekdays | VARCHAR(250) | JSON array de dias — ex.: "[1,3,5]" |
| days_of_month | TEXT | JSON array de dias do mês |
| interval_day | INTEGER | Intervalo em dias |
| cron | TEXT | Expressão cron |
| timezone | VARCHAR(255) | NULLABLE |
| duration | INTEGER | Duração em segundos |

#### `status_page`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| slug | VARCHAR(255) | UNIQUE — identificador da URL |
| title | VARCHAR(255) | NOT NULL |
| description | TEXT | NULLABLE |
| theme | VARCHAR(30) | NOT NULL |
| published | BOOLEAN | DEFAULT: true |
| password | VARCHAR(255) | NULLABLE — proteção por senha |
| custom_css | TEXT | NULLABLE |
| footer_text | TEXT | NULLABLE |
| auto_refresh_interval | INTEGER UNSIGNED | DEFAULT: 300 (segundos) |
| show_certificate_expiry | BOOLEAN | DEFAULT: false |
| analytics_type | ENUM | google, umami, plausible, matomo |
| analytics_id / analytics_script_url | VARCHAR | Config analytics |

#### `api_key`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| key | VARCHAR(255) | NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| user_id | INTEGER UNSIGNED | NOT NULL, FK → user(id) CASCADE DELETE |
| created_date | DATETIME | DEFAULT: NOW() |
| active | BOOLEAN | DEFAULT: true |
| expires | DATETIME | NULLABLE |

#### `setting`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| key | VARCHAR(200) | NOT NULL, UNIQUE |
| value | TEXT | NULLABLE |
| type | VARCHAR(20) | NULLABLE |

Armazena configurações globais da instância como chave-valor.

---

### Tabelas de estatísticas

As três tabelas abaixo têm estrutura idêntica — diferem apenas na granularidade do timestamp:

| Tabela | Granularidade |
|--------|--------------|
| `stat_minutely` | Por minuto |
| `stat_hourly` | Por hora |
| `stat_daily` | Por dia |

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | INTEGER PK | AUTO INCREMENT |
| monitor_id | INTEGER UNSIGNED | FK → monitor(id) CASCADE DELETE |
| timestamp | INTEGER | Unix timestamp (início do período) |
| ping | FLOAT(20,2) | Latência média |
| ping_min / ping_max | FLOAT(20,2) | Mínimo e máximo |
| up | SMALLINT | Contagem de checks UP no período |
| down | SMALLINT | Contagem de checks DOWN no período |
| extras | TEXT | NULLABLE — dados extras em JSON |

**Constraint:** UNIQUE(monitor_id, timestamp)

---

### Tabelas de relacionamento (junction tables)

| Tabela | Relacionamento |
|--------|---------------|
| `monitor_notification` | monitor ↔ notification (M:N) |
| `monitor_tag` | monitor ↔ tag (M:N) + campo `value` |
| `monitor_group` | monitor ↔ group (M:N) + `weight`, `send_url`, `custom_url` |
| `monitor_tls_info` | monitor → info TLS do certificado (JSON) |
| `monitor_maintenance` | monitor ↔ maintenance (M:N) |
| `maintenance_status_page` | maintenance ↔ status_page (M:N) |
| `maintenance_timeslot` | timeslots gerados para cada maintenance |
| `status_page_cname` | domínios CNAME customizados por status_page |
| `notification_sent_history` | deduplicação de notificações já enviadas |

#### `maintenance_timeslot` — detalhe
| Coluna | Tipo | Notas |
|--------|------|-------|
| maintenance_id | INTEGER UNSIGNED | FK → maintenance(id) CASCADE |
| start_date / end_date | DATETIME | Intervalo gerado |
| generated_next | BOOLEAN | Se o próximo slot já foi gerado |

#### `notification_sent_history` — detalhe
| Coluna | Tipo | Notas |
|--------|------|-------|
| type | VARCHAR(50) | Tipo de notificação (ex.: "certificate-expiry") |
| monitor_id | INTEGER UNSIGNED | NOT NULL |
| days | INTEGER | Threshold em dias |

UNIQUE(type, monitor_id, days) — evita reenvio da mesma notificação.

---

### Diagrama de relacionamentos

```
user (1) ──────────────────────────────────────────────┐
  │                                                     │
  ├─(1:N)─► monitor ◄─────────────────────────────(FK parent — auto-referência)
  │            │
  │            ├─(1:N)─► heartbeat
  │            ├─(1:N)─► stat_minutely / stat_hourly / stat_daily
  │            ├─(1:N)─► monitor_tls_info
  │            │
  │            ├─(M:N via monitor_notification)─► notification
  │            ├─(M:N via monitor_tag)──────────► tag
  │            ├─(M:N via monitor_group)─────────► group ──► status_page
  │            └─(M:N via monitor_maintenance)──► maintenance
  │                                                    │
  │                                              ├─► maintenance_timeslot
  │                                              └─► maintenance_status_page ──► status_page
  │
  ├─(1:N)─► api_key
  ├─(1:N)─► proxy ◄────── monitor.proxy_id
  ├─(1:N)─► docker_host ◄─ monitor.docker_host
  └─(1:N)─► maintenance

status_page (1) ──► status_page_cname (domínios CNAME)
status_page (1) ──► incident (banners de incidente)
```
