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
