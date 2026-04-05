# Análise do OpAMP no HyperDX API (como vira API e como gerencia o collector)

## Escopo analisado
- `otel/hyperdx/packages/api/src/opamp/app.ts`
- `otel/hyperdx/packages/api/src/opamp/controllers/opampController.ts`
- `otel/hyperdx/packages/api/src/opamp/services/agentService.ts`
- `otel/hyperdx/packages/api/src/opamp/models/agent.ts`
- `otel/hyperdx/packages/api/src/opamp/utils/protobuf.ts`
- `otel/hyperdx/packages/api/src/opamp/proto/opamp.proto`
- Integração com `otel/hyperdx/packages/api/src/server.ts`

---

## 1) Como esse módulo “vira uma API”

O módulo OpAMP é exposto como um **servidor HTTP separado** dentro do mesmo processo da API principal:

1. `server.ts` importa `opampApp` (`@/opamp/app`).
2. Em `start()`, cria **dois servidores HTTP**:
   - `appServer` (API principal) em `PORT`
   - `opampServer` (OpAMP) em `OPAMP_PORT`
3. O `opampApp` (`opamp/app.ts`) registra:
   - `POST /v1/opamp` (payload protobuf)
   - `GET /health`
4. O endpoint `POST /v1/opamp` delega para `opampController.handleOpampMessage()`.

Resultado: o collector conversa com o endpoint OpAMP dedicado, não com as rotas REST padrão.

---

## 2) Fluxo completo de processamento OpAMP

### Entrada (HTTP + Protobuf)
- Endpoint exige `Content-Type: application/x-protobuf`.
- Body parser é `express.raw(...)` para manter binário intacto.
- Controller decodifica `AgentToServer` via `protobufjs`.

### Processamento de estado do agent
- `agentService.processAgentStatus()`:
  - extrai `instanceUid`, `sequenceNum`, `capabilities`, `effectiveConfig`, `remoteConfigStatus`, etc.
  - busca agent no `agentStore` (Map em memória)
  - cria/atualiza registro
  - atualiza `lastSeen`

### Montagem da resposta `ServerToAgent`
- Sempre inclui:
  - `instanceUid`
  - `capabilities` do servidor (bitmask com `AcceptsStatus | OffersRemoteConfig | AcceptsEffectiveConfig`)
- Condicionalmente inclui `remoteConfig` (ver seção FAQ abaixo)

### Geração de remote config
- Quando habilitado para o agent, o controller:
  1. Busca times em `getAllTeams(['apiKey', 'collectorAuthenticationEnforced'])`
  2. Gera config OTel dinâmica com `buildOtelCollectorConfig(...)`
  3. Serializa JSON em `config.json`
  4. Cria `configHash` SHA-256
  5. Anexa em `serverToAgent.remoteConfig`

### Saída
- Response é codificado em Protobuf (`encodeServerToAgent`)
- Retorno com `Content-Type: application/x-protobuf`

---

## 3) Como ele gerencia o processo OpAMP no collector

Na prática, o “gerenciamento” acontece via **ciclo de polling/status** do supervisor OpAMP do collector:

1. Collector envia `AgentToServer` periodicamente para `/v1/opamp`.
2. Servidor processa estado reportado.
3. Se o collector declara capacidade de aceitar remote config, servidor responde com config remota.
4. Collector aplica e depois reporta `remote_config_status` / `effective_config` nos próximos pings.

Observação importante: este servidor **não mantém orquestração sofisticada por versão**; ele opera no modelo “recebe status e oferece config” a cada ciclo elegível.

---

## 4) FAQ objetiva (suas perguntas + pertinentes)

### Ele sempre manda o remote config?
**Não sempre.**
Ele manda `remoteConfig` **somente** se o agent tiver o bit de capability `AcceptsRemoteConfig` (`0x00000002`) ligado.

### O que ele verifica antes de responder?
Checks principais:
1. `Content-Type` precisa ser `application/x-protobuf`.
2. Mensagem protobuf precisa decodificar corretamente.
3. Capability do agent para aceitar remote config.
4. Para autenticação no receiver OTLP:
   - existência de API keys (`team.apiKey` + `INGESTION_API_KEY` em alguns modos)
   - flag `collectorAuthenticationEnforced` do time

### Ele compara hash/config atual para decidir enviar update?
**Não.**
Embora calcule `configHash` ao montar `remoteConfig`, o fluxo atual não usa `remoteConfigStatus.lastRemoteConfigHash` do agent para “short-circuit” de envio.

### Como salva o estado?
- Salva em `AgentStore` (um `Map<string, Agent>`) em memória do processo Node.
- Chave: `instanceUid` em hex.
- Dados: `sequenceNum`, capabilities, effective config, remote config status, `lastSeen`, etc.

### Esse estado persiste após restart do serviço?
**Não.**
É armazenamento volátil em memória; reinício limpa tudo.

### Ele usa `sequenceNum` para detectar perda de mensagens?
Hoje **não**. O valor é armazenado, mas não há lógica de detecção/ação (ex.: `ReportFullState`).

### Ele usa `remoteConfigStatus` para rollback/retry lógico?
Hoje **não**. O status é armazenado, mas não guia decisão de envio/retentativa no controller.

### Como define autenticação do collector?
- Se houver API keys e `collectorAuthenticationEnforced=true`:
  - adiciona extensão `bearertokenauth/hyperdx`
  - injeta `auth.authenticator` em OTLP gRPC/HTTP
- Se `collectorAuthenticationEnforced=false`, OTLP pode operar sem bearer auth.

### O server suporta features OpAMP além de remote config?
No código analisado, o foco é status + remote config. Outras capacidades do proto (packages, connection settings, commands, etc.) não estão implementadas no fluxo de resposta atual.

---

## 5) Pontos de atenção técnicos

1. **Estado efêmero**: sem persistência durável do estado dos agents.
2. **Sem deduplicação de config**: tendência a enviar remote config em todo ciclo elegível.
3. **Sem uso de sequência para reconciliação**: não usa `sequenceNum` para recuperação de lacunas.
4. **Escalabilidade horizontal**: com múltiplas réplicas, cada instância tem visão parcial dos agents (store local por processo).

---

## 6) Resumo executivo

- O OpAMP do HyperDX é uma API HTTP binária dedicada (`/v1/opamp`) em porta separada.
- Ele recebe status do collector, mantém estado em memória e oferece remote config dinâmica baseada em times/API keys.
- O envio de remote config é condicionado à capability do agent, mas não há lógica de “só quando mudou”.
- A gestão atual privilegia simplicidade operacional, com trade-offs de persistência, reconciliação e eficiência de update.

---

## 7) Referências em `otel/hyperdx/docker/otel-collector` (OpAMP)

Sim, existem referências importantes ao OpAMP nesta pasta. Principais paths:

- `otel/hyperdx/docker/otel-collector/supervisor_docker.yaml.tmpl`
  - Define o endpoint do servidor OpAMP: `{{ getenv "OPAMP_SERVER_URL" }}/v1/opamp`.
  - Habilita capabilities do supervisor/agent, incluindo:
    - `accepts_remote_config: true`
    - `reports_remote_config: true`
    - `reports_effective_config: true`
  - Define `storage.directory: /etc/otel/supervisor-data/` para estado do supervisor no container.

- `otel/hyperdx/docker/otel-collector/Dockerfile`
  - Usa imagem `otel/opentelemetry-collector-opampsupervisor`.
  - Copia binário `opampsupervisor` para a imagem final.
  - Copia template `supervisor_docker.yaml.tmpl` para `/etc/otel/supervisor.yaml.tmpl`.
  - `ENTRYPOINT` inicia o supervisor: `[/entrypoint.sh, /opampsupervisor]`.

- `otel/hyperdx/docker/otel-collector/config.yaml`
  - Contém comentários dizendo que receivers/connectors/exporters/pipelines são configurados dinamicamente no `opampController.ts`.
  - Ou seja, é um indício explícito de que o plano de configuração do collector é governado por OpAMP remoto.

- `otel/hyperdx/docker/otel-collector/config.standalone.yaml`
  - Declara que o conteúdo é derivado de `packages/api/src/opamp/controllers/opampController.ts`.
  - Funciona como referência estática equivalente ao config remoto gerado no backend.

Leitura operacional: o `docker/otel-collector` mostra claramente que o processo real é **opampsupervisor no collector puxando configuração de `/v1/opamp`**, e não apenas um config local fixo.

---

## 8) Remote config substitui o config local?

**Não totalmente.** Neste setup, o comportamento é **híbrido (base local + overlay remoto via OpAMP)**.

- Base local (`config.yaml`): mantém blocos estruturais como `processors`, `extensions` e `service.telemetry`.
- Remoto (`opampController.ts`): injeta principalmente `receivers`, `connectors`, `exporters` e `pipelines` dinâmicos.
- Evidência prática: o remoto referencia processors como `memory_limiter`, `batch` e `transform`; se substituísse 100% o local, faltariam definições desses componentes.
- Em modo sem OpAMP (standalone), arquivos locais completos como `config.standalone.yaml` e `config.standalone.auth.yaml` passam a ser a fonte única de configuração.

Paths de referência deste ponto:
- `otel/hyperdx/docker/otel-collector/config.yaml`
- `otel/hyperdx/packages/api/src/opamp/controllers/opampController.ts`
- `otel/hyperdx/docker/otel-collector/config.standalone.yaml`
- `otel/hyperdx/docker/otel-collector/config.standalone.auth.yaml`
