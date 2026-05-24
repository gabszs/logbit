# Lightdash - Relatorio de IA

## Escopo

Analise do projeto `otel/lightdash` com foco em como a IA e implementada, como perguntas viram acoes no sistema, quais bibliotecas sustentam o agente, como dashboards/graficos sao gerados e se a IA consegue interagir de volta com o produto.

## Resumo executivo

O Lightdash implementa um copilot/AI analyst real, principalmente em codigo Enterprise Edition:

- Backend: `packages/backend/src/ee/services/ai` e `packages/backend/src/ee/services/AiAgentService`.
- Frontend: `packages/frontend/src/ee/features/aiCopilot`.
- Contratos/tipos/schemas: `packages/common/src/ee/AiAgent`.
- UI principal: rotas `/projects/:projectUuid/ai-agents/...`.

O agente nao e so chat textual. Ele usa tools registradas no Vercel AI SDK para pesquisar explores/campos/conteudo, executar queries governadas pelo semantic layer, executar SQL com aprovacao humana, gerar artefatos de chart/dashboard, propor melhorias no modelo semantico e renderizar resultados interativos no frontend.

## Bibliotecas principais

Backend:

- `ai` (`streamText`, `generateText`, `tool`, `generateObject`, `readUIMessageStream` no frontend): orquestracao de modelo, tool calling e streaming.
- `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/azure`, `@ai-sdk/amazon-bedrock`: providers de modelo.
- `@openrouter/ai-sdk-provider`: provider OpenRouter.
- `@anthropic-ai/sdk`: usado em fluxos auxiliares/managed agent.
- `@langchain/core`, `@langchain/openai`, `langchain`: presentes para features auxiliares.
- `zod`: schemas de input/output de tools e validacao.
- `@casl/ability`: permissoes.
- `@slack/bolt`, `@slack/web-api`, `slackify-markdown`: integracao Slack.
- `echarts`, `canvas`: renderizacao de chart para envio no Slack.
- `csv-stringify`: serializacao de resultados para CSV.
- `@sentry/node`, Prometheus: observabilidade.

Frontend:

- `ai`: parser de stream UI message.
- `@tanstack/react-query`: cache, busca de artifacts e resultados.
- Mantine, Tabler icons: UI.
- Redux Toolkit slices locais para estado de streaming/artifacts.

## Configuracao de IA

As env vars aparecem em `docker-compose.yml` e `packages/backend/src/config/parseConfig.ts`:

- `AI_COPILOT_ENABLED`
- `AI_DEFAULT_PROVIDER`
- `AI_COPILOT_MAX_QUERY_LIMIT`
- `AI_COPILOT_DEBUG_LOGGING_ENABLED`
- `AI_COPILOT_TELEMETRY_ENABLED`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AZURE_AI_*`
- `BEDROCK_*`
- `OPENROUTER_*`

Os modelos sao resolvidos em `packages/backend/src/ee/services/ai/models/index.ts` e presets ficam em `models/presets.ts`. O projeto suporta OpenAI, Anthropic, Azure OpenAI, Bedrock e OpenRouter. O seletor tambem permite `enableReasoning`, modelo por prompt e fallback para modelos rapidos em tarefas leves.

## Fluxo de arquitetura

```text
Usuario
  |
  | digita pergunta no frontend aiCopilot
  v
Frontend cria prompt/thread via API
  |
  | POST /projects/:projectUuid/aiAgents/:agentUuid/threads/:threadUuid/stream
  v
AiAgentController
  |
  v
AiAgentService.streamAgentThreadResponse()
  |
  v
prepareAgentThreadResponse()
  - valida usuario/agente/thread
  - monta historico de mensagens
  - injeta artifacts verificados/relevantes quando habilitado
  |
  v
generateOrStreamAgentResponse()
  - checa AI Copilot habilitado
  - monta dependencias do agente
  - resolve permissoes: data access, SQL mode, manage agent
  - escolhe modelo/provider
  - monta args do agente
  |
  v
streamAgentResponse() em agents/agentV2.ts
  - carrega explores disponiveis
  - monta system prompt
  - registra tools
  - chama streamText({ model, messages, tools })
  |
  v
Modelo chama tools
  - findExplores/findFields/findContent
  - runQuery/runSavedChart/runSql
  - generateDashboard
  - improveContext/proposeChange
  |
  v
Tool executa no Lightdash
  - consulta catalog/search/semantic layer/warehouse
  - cria artifact chart/dashboard
  - persiste tool call/result
  |
  v
Stream volta ao frontend
  - texto incremental
  - reasoning
  - tool calls
  - artifacts
  |
  v
Frontend renderiza chat + painel de artifact
  - graficos
  - dashboards gerados
  - quick actions
  - salvar dashboard real
```

## Como a pergunta vira acao

O prompt do sistema e montado em `packages/backend/src/ee/services/ai/prompts/systemV2.ts` a partir de:

- nome/instrucoes do agente;
- data atual;
- explores disponiveis;
- se o agente tem acesso a dados;
- se pode rodar SQL;
- se pode se auto-melhorar.

O template em `systemV2Template.ts` e bem prescritivo. Ele instrui o agente a:

- assumir que perguntas sao de analise de dados;
- procurar explores primeiro (`findExplores`);
- resolver ambiguidade antes de escolher fonte;
- chamar `findFields` apenas depois de escolher o explore;
- usar `runQuery` para criar charts/tabelas;
- usar filtros de tempo reais quando o usuario mencionar periodo;
- usar `findContent` para buscar dashboards/charts existentes;
- para dashboards, pesquisar fontes/campos, buscar dashboards existentes para inspiracao e gerar multiplas visualizacoes consistentes.

O Lightdash adiciona contexto semantico pelo proprio modelo Lightdash/dbt. Exemplo no demo `examples/full-jaffle-shop-demo/lightdash/models/orders.yml`: campos podem ter `description`, `ai_hint`, `default_time_dimension`, metricas, joins e explores. Isso alimenta a selecao e a criacao de queries.

## Tools disponiveis

As tools sao registradas em `packages/backend/src/ee/services/ai/agents/agentV2.ts`:

- `findExplores`: acha explores relevantes e campos candidatos.
- `findFields`: carrega campos completos de um explore.
- `findContent`: busca dashboards e charts existentes.
- `getDashboardCharts`: lista charts de um dashboard existente.
- `runQuery`: executa query governada pelo semantic layer e cria artifact de chart.
- `runSavedChart`: executa um chart salvo.
- `generateDashboard`: cria artifact de dashboard com varias visualizacoes.
- `searchFieldValues`: procura valores de dimensoes.
- `runSql`: executa SQL raw, quando permitido, com aprovacao.
- `listWarehouseTables` e `describeWarehouseTable`: descoberta de tabelas raw para SQL.
- `improveContext`: sugere melhoria de instrucoes do agente, apenas para quem gerencia o agente.
- `proposeChange`: cria uma proposta de mudanca no semantic layer.

Os nomes e mensagens de UI ficam em `packages/common/src/ee/AiAgent/schemas/visualizations/index.ts`.

## Como ele cria graficos

A tool `runQuery` fica em `packages/backend/src/ee/services/ai/tools/runQuery.ts`.

Fluxo:

1. Recebe configuracao da query e chart.
2. Valida explore, dimensoes, metricas, filtros, sorts, custom metrics e table calculations.
3. Cria um `metricQuery` Lightdash governado.
4. Executa via `runAsyncQuery`.
5. Se a feature `enableDataAccess` estiver desligada, cria o artifact sem retornar dados ao modelo.
6. Se `enableDataAccess` estiver ligada, retorna CSV serializado para o modelo analisar.
7. Cria/atualiza artifact de tipo `chart`.
8. Em Slack, renderiza imagem ECharts ou envia CSV.

Isso e importante: o modelo nao "desenha" o grafico sozinho no frontend. Ele gera uma configuracao validada, o backend persiste como artifact, e o frontend renderiza usando componentes Lightdash.

## Como ele cria dashboards

A tool `generateDashboard` usa `packages/backend/src/ee/services/ai/tools/generateDashboardV2.ts`.

Ela recebe:

- `title`
- `description`
- `visualizations`: array de 2 a 15 configs, cada uma no mesmo formato de `runQuery`.

Fluxo:

1. Parseia e transforma os argumentos com Zod.
2. Valida cada visualizacao contra o explore correspondente.
3. Remove visualizacoes invalidas e acumula erros.
4. Se nenhuma for valida, retorna erro ao modelo.
5. Se houver pelo menos uma valida, cria/atualiza artifact de tipo `dashboard`.
6. O artifact guarda a configuracao do dashboard, nao cria imediatamente um dashboard persistido no produto.

O schema descreve a filosofia do dashboard: KPIs no topo, series temporais, comparacoes categoricas, proporcoes, correlacoes, funis e detalhamentos.

## O dashboard gerado vira dashboard real?

Sim, mas em duas etapas.

1. A IA gera um **artifact de dashboard**.
2. O usuario salva esse artifact como dashboard real via UI.

No frontend:

- `AiArtifactPanel.tsx` carrega o artifact.
- Se for dashboard, renderiza `AiDashboardVisualization.tsx`.
- `AiDashboardQuickOptions.tsx` mostra "Save dashboard".
- `AiDashboardSaveModal.tsx` pede nome/descricao/space.
- O modal busca resultados de cada visualizacao no cache React Query.
- Converte visualizacoes para chart data com `dashboardChartConverter.ts`.
- Chama `useCreateDashboardWithChartsMutation`.
- Depois atualiza a versao do artifact com `savedDashboardUuid`.

Entao a IA pode gerar a proposta completa de dashboard, mas a persistencia como dashboard oficial passa por acao explicita do usuario. Esse design e bom: reduz risco de o modelo criar conteudo permanente sem revisao.

## A IA interage de volta com o sistema?

Sim, de varias formas:

- **Executa queries governadas**: `runQuery` usa o semantic layer Lightdash.
- **Executa SQL raw com aprovacao**: `runSql` espera aprovacao humana antes de executar.
- **Cria artifacts**: charts e dashboards ficam persistidos como objetos do agente.
- **Atualiza prompt/model response**: respostas parciais, erros e progresso sao salvos.
- **Registra tool calls/results**: cada chamada de tool e armazenada no banco.
- **Pode propor mudancas no modelo semantico**: `proposeChange` cria changeset com source prompt.
- **Pode sugerir melhoria de contexto**: `improveContext` gera uma instrucao sugerida para o agente.
- **No Slack**, pode atualizar mensagens, pedir aprovacao SQL e enviar arquivos/imagens.

Mas ha limites:

- Dashboard real exige clique do usuario para salvar.
- SQL raw exige feature flag, permissao CASL de SQL Runner, `enableSqlMode` e aprovacao.
- `proposeChange` cria proposta/changeset, nao altera silenciosamente o modelo em producao.
- Tools sensiveis so sao registradas quando a permissao/feature permite.

## Streaming e frontend

O frontend consome:

```text
POST /projects/:projectUuid/aiAgents/:agentUuid/threads/:threadUuid/stream
```

em `useAiAgentThreadStreamMutation.ts`.

Ele usa:

- `lightdashApiStream`
- `DefaultChatTransport`
- `readUIMessageStream`
- Redux slices para:
  - texto incremental;
  - partes ordenadas;
  - tool calls;
  - reasoning;
  - erro;
  - estado de aprovacao SQL;
  - artifact aberto.

O stream preserva intercalacao texto/tool. Tool calls aparecem como partes `tool-*`, por exemplo `tool-runQuery`, `tool-generateDashboard`, `tool-runSql`.

## SQL mode e aprovacao humana

`runSql` e tratado como caminho especial.

Gates:

- feature flag `AiAgentRunSql`;
- parametro frontend `enableSqlMode`;
- permissao CASL para `SqlRunner`;
- em Slack, requer OAuth quando aplicavel;
- SQL precisa ser `SELECT` ou `WITH`;
- DDL/DML e `information_schema` sao bloqueados.

O frontend exibe `SqlApprovalCard.tsx`, que mostra o SQL e botoes:

- Approve
- Approve & don't ask again this thread
- Reject

O endpoint de decisao e:

```text
POST /projects/:projectUuid/aiAgents/:agentUuid/threads/:threadUuid/tool-calls/:toolCallId/sql-approval
```

No Slack, existe estado de auto-aprovacao por thread em memoria (`sqlApprovals.ts`), mas a decisao de aprovacao/rejeicao e persistida no banco via model.

## Artifacts, verificacao e RAG

O Lightdash trata respostas visuais como artifacts versionados. O usuario pode verificar artifacts, e o agente consegue recuperar artifacts verificados relevantes para futuras perguntas.

Pontos interessantes:

- Artifacts podem ser `chart` ou `dashboard`.
- Existem endpoints para buscar artifact, versao, viz-query e dashboard/chart queries.
- Artifacts verificados podem virar contexto reutilizavel.
- Isso cria uma memoria curada: nao e so historico de chat, e uma base de respostas confiaveis com configuracao executavel.

## Managed agent e Slack

Alem do chat web, existe integracao Slack no `AiAgentService`:

- Mensagens/mentions podem ser roteadas a agentes.
- Ha selecao multi-agent em canais configurados.
- O agente pode postar blocos, arquivos e imagens.
- Para queries, pode responder no thread do Slack com chart renderizado ou CSV.

Tambem existe `ManagedAgentService`, mas o nucleo do fluxo de pergunta->tool->artifact esta em `AiAgentService` + `services/ai`.

## Pontos fortes da arquitetura

- Tools fortemente tipadas com Zod e compartilhadas em `common`.
- Validacao antes de executar queries ou criar artifacts.
- Separacao boa entre:
  - raciocinio/modelo (`agentV2.ts`);
  - contratos (`common/src/ee/AiAgent`);
  - capacidades do produto (`AiAgentService` dependencies);
  - UI/streaming (`frontend/src/ee/features/aiCopilot`).
- Human-in-the-loop em SQL e save de dashboard.
- Observabilidade com Sentry, analytics e Prometheus.
- Suporte a varios providers/modelos.
- Contexto semantico rico via explores, fields, `description`, `ai_hint`, metricas e joins.

## Pontos de atencao

- `generateDashboard` cria artifact, nao dashboard persistido diretamente. Isso e intencional, mas importante para UX/documentacao.
- A qualidade depende muito dos metadados Lightdash/dbt (`description`, `ai_hint`, metricas nomeadas, joins).
- `enableDataAccess` muda muito o comportamento: com dados, o modelo analisa CSV; sem dados, ele cria artifact sem ver resultados.
- SQL mode e poderoso, mas bem protegido. Para apps que copiem essa arquitetura, manter aprovacao humana e validacao SELECT-only e essencial.
- O sistema registra tool calls e results, o que e otimo para debug/evals, mas exige cuidado de privacidade quando `telemetryEnabled` grava inputs/outputs.

## Arquivos-chave

- `packages/backend/src/ee/services/ai/agents/agentV2.ts`
- `packages/backend/src/ee/services/AiAgentService/AiAgentService.ts`
- `packages/backend/src/ee/controllers/aiAgentController.ts`
- `packages/backend/src/ee/services/ai/prompts/systemV2.ts`
- `packages/backend/src/ee/services/ai/prompts/systemV2Template.ts`
- `packages/backend/src/ee/services/ai/tools/runQuery.ts`
- `packages/backend/src/ee/services/ai/tools/generateDashboardV2.ts`
- `packages/backend/src/ee/services/ai/tools/runSql.ts`
- `packages/backend/src/ee/services/ai/tools/proposeChange.ts`
- `packages/backend/src/ee/services/ai/models/index.ts`
- `packages/backend/src/ee/services/ai/models/presets.ts`
- `packages/common/src/ee/AiAgent`
- `packages/frontend/src/ee/features/aiCopilot/streaming/useAiAgentThreadStreamMutation.ts`
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.tsx`
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiDashboardSaveModal.tsx`
- `packages/frontend/src/ee/features/aiCopilot/utils/dashboardChartConverter.ts`
