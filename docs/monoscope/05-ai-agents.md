# AI agents

## Arquitetura

O sistema de AI fica principalmente em `src/Pkg/AI.hs`. Ele nao implementa "agents" como entidades configuraveis pelo usuario com lifecycle proprio; implementa um agente LLM de query/analise com tool calling, usado por:

- Bots Slack/Discord/WhatsApp.
- Chat de investigacao em anomalies/issues.
- Query assistant / respostas naturais.
- Enriquecimento de issues em background jobs.

## Stack AI

Bibliotecas e integracoes:

- `openai`
- `langchain-hs`
- `Langchain.Memory.TokenBufferMemory`
- `Data.Effectful.LLM`
- Modelos configurados por env: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_SMALL_MODEL`, `OPENAI_BASE_URL`.

## Como roda

Fluxo de `runAgenticQuery`:

1. Monta system prompt com schema de telemetria, guia KQL, instrucoes de output e contexto do projeto.
2. Adiciona mensagem do usuario.
3. Chama OpenAI chat completions com tools.
4. Se o modelo pedir tool call, executa tool no backend.
5. Adiciona resultado da tool ao historico.
6. Repete ate `maxIterations` ou resposta final.
7. Faz parse de JSON para `LLMResponse`.

Fluxo de `runAgenticChatWithHistory`:

1. Carrega historico do banco via `Issues.selectChatHistory`.
2. Insere mensagem do usuario.
3. Roda loop agentico.
4. Retorna `AgenticChatResult` com resposta e lista de tool calls.

## Tools disponiveis para o agente

Em `allToolDefs`:

- `get_field_values`
- `get_services`
- `count_query`
- `sample_logs`
- `get_facets`
- `get_schema`
- `run_query`
- `run_sql_query`

As tools executam KQL/SQL sempre no backend, com filtro de projeto. `run_query` tambem devolve `rawData`, que pode ser reaproveitado para renderizar widgets sem reexecutar query.

## Prompt e formato

O agente e instruido a retornar JSON com:

- `explanation`
- `query`
- `visualization`
- `widgets`
- `time_range`

O guia KQL proibe inventar campos e recomenda usar `get_schema`/`get_field_values` quando necessario.

## Memoria e historico

- Conversas ficam em `apis.ai_conversations` / `apis.ai_chat_messages`.
- O chat de anomaly usa o `issue_id` como conversation id.
- `TokenBufferMemory` limita historico por tokens.

## Como "permite criacao de agente"

Nao encontrei um cadastro generico de agentes customizados pelo usuario. O que existe e:

- Configuracao dinamica via `AgenticConfig`.
- Contexto custom (`customContext`).
- Override de system prompt (`systemPromptOverride`).
- `conversationId` e `conversationType`.
- Uso do mesmo motor agentico em diferentes superficies: bots, anomaly chat e background processing.

Entao a extensibilidade e por codigo/configuracao, nao por uma UI de "crie seu agente".

## Fontes no codigo

- `src/Pkg/AI.hs`
- `src/Pages/Bots/Utils.hs`
- `src/Pages/Bots/Slack.hs`
- `src/Pages/Bots/Discord.hs`
- `src/Pages/Bots/Whatsapp.hs`
- `src/Pages/Anomalies.hs`
- `src/Models/Apis/Issues.hs`
- `src/BackgroundJobs.hs`
