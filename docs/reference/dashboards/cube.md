# Cube — Implementação de IA: Relatório de Análise

> Projeto analisado: `/home/gabriel-carvalho/Documents/loglog/otel/cube`
> Repositório original: [github.com/cube-js/cube](https://github.com/cube-js/cube)

---

## 1. Visão Geral

O Cube se posiciona como uma **"agentic analytics platform"** — uma plataforma de BI onde tanto humanos quanto agentes de IA interagem com dados através de uma **camada semântica centralizada**.

O produto tem duas camadas:
- **Cube Core** — open-source: camada semântica (Schema Compiler, Query Orchestrator, API Gateway, drivers de banco)
- **Cube Cloud** — SaaS fechado: toda a IA, o agente, o Chat, os dashboards e o storage de memórias

**A implementação de IA não está no código open-source.** O backend de IA roda em `ai.{cloudRegion}.cubecloud.dev`. O repositório open-source fornece a infraestrutura que a IA usa (APIs, camada semântica), não o agente em si.

---

## 2. Conceito Central: Semantic SQL

O ponto arquitetural mais importante do projeto. O agente de IA **nunca fala diretamente com o data warehouse**. Ele passa por uma camada intermediária que:

1. Valida todas as queries
2. Aplica access control (row-level security, column masking)
3. Resolve métricas centralizadas
4. Usa pre-aggregations (cache) para velocidade

```
Usuário / Agente de IA
        ↓
    Semantic SQL
        ↓
  Cubo Semantic Layer   ← valida, aplica RLS, resolve métricas
        ↓
  Pre-aggregations / Cache (CubeStore)
        ↓
  Data Warehouse (ClickHouse, BigQuery, Snowflake, etc.)
```

O Semantic SQL estende Postgres-compatible SQL com a função `MEASURE()` — que sabe como se auto-calcular a partir das definições do data model.

---

## 3. Arquitetura do Agente de IA

### 3.1 Framework e Libs

| Componente | Lib / Tecnologia |
|---|---|
| Orquestração do agente | **LangGraph** (confirmado pelo formato de resposta que referencia `langchain_core.messages.HumanMessage` e `create_react_agent`) |
| LLMs suportados | Anthropic Claude (3.5/3.7/4.x), OpenAI GPT (4o/4.1/5), modelos próprios via BYOM |
| Embeddings | OpenAI `text-embedding-3-large` (padrão) |
| Vector store | Interno (Cube Cloud) — usado para memórias e certified queries |
| Visualizações | **Vega-Lite v5** — o agente gera specs de gráfico no campo `vegaSpec` |
| Protocolo externo | **MCP** (Model Context Protocol) — permite conexão de Claude Code, Cursor, Codex |
| Streaming | **NDJSON streaming** — cada evento é uma linha JSON separada |

### 3.2 Ferramentas do Agente (Tool Calls)

O agente usa ReAct (Reasoning + Acting) via LangGraph e tem duas ferramentas principais:

#### `cubeMeta` — Busca no Data Model
```json
Input:  { "searchQuery": "revenue trends" }
Output: {
  "cubes": [{
    "name": "revenue_view",
    "type": "view",
    "members": [
      { "name": "revenue_view.total_amount", "type": "number", "aggType": "sum" },
      { "name": "revenue_view.month", "type": "time" }
    ]
  }]
}
```
Funciona como um **search semântico** sobre o data model — encontra as views, cubes, measures e dimensions relevantes para a pergunta.

#### `cubeSqlApi` — Executa SQL
```json
Input: {
  "sqlQuery": "SELECT revenue_view.total_amount, revenue_view.month FROM revenue_view",
  "queryTitle": "Revenue by Month",
  "description": "Monthly revenue for the last 6 months",
  "userRequest": "show me revenue trends",
  "vegaSpec": "{ ... vega-lite v5 spec ... }"
}
Output: {
  "schema": [{ "name": "total_amount", "column_type": "Double" }],
  "data": [[1800000, "2024-01"], [2100000, "2024-02"]],
  "totalRows": 6,
  "vegaSpec": "{ ... }"
}
```
O agente gera o SQL, gera o spec do gráfico Vega-Lite, executa e retorna dados + schema + visualização.

### 3.3 Fluxo Interno de Uma Pergunta

```
Usuário: "Qual foi a receita por produto no Q3?"
         │
         ▼
  POST /chat/stream-chat-state
  { input: "...", sessionSettings: { externalId: "user@..." } }
         │
         ▼
  ┌─────────────────────────────────────────────┐
  │  LangGraph Agent (cube_data_analyst_agent)  │
  │                                             │
  │  1. Raciocínio inicial (thinking)           │
  │     "O usuário quer receita por produto..." │
  │                                             │
  │  2. Tool call: cubeMeta                     │
  │     searchQuery: "revenue product Q3"       │
  │     → retorna revenue_view, product_view    │
  │                                             │
  │  3. Tool call: cubeSqlApi                   │
  │     sqlQuery: SELECT product.name,          │
  │       revenue.total FROM ...                │
  │       WHERE quarter = 'Q3'                  │
  │     vegaSpec: { bar chart spec }            │
  │     → retorna dados + spec                  │
  │                                             │
  │  4. Sintetiza resposta final                │
  │     graphPath: ["final"]                    │
  └─────────────────────────────────────────────┘
         │
         ▼
  Stream NDJSON:
  { id: "...", role: "assistant", content: "...", graphPath: ["final"] }
```

### 3.4 Formato do Stream NDJSON

Cada evento do stream é uma linha JSON. Tipos de mensagens por `graphPath`:

| `graphPath` | Tipo |
|---|---|
| `["cube_data_analyst_agent"]` | Resposta/raciocínio em progresso |
| `["cube_data_analyst_agent", "tools"]` | Tool call ou resultado de tool |
| `["final"]` | Resposta consolidada final |
| `id: "__cutoff__"` | Estado inicial do thread (contém `chatId`) |
| `id: "__state__"` | Estado final (histórico LangChain) |

**Como extrair a resposta final:**
```javascript
const finalAnswer = messages
  .filter(m => m.role === "assistant" && m.graphPath?.[0] === "final" && m.graphPath.length <= 2)
  .at(-1)?.content;
```

---

## 4. Interação Bidirecional: O Agente MODIFICA o Sistema

Esse é o diferencial mais importante. O agente não é só read-only — ele pode **agir de volta sobre o produto**:

### 4.1 Criar Calculated Fields no Data Model
> "Crie uma measure de ticket médio para mim"

O agente cria campos calculados via Semantic SQL e pode **persistir como novas measures/dimensions no data model** (YAML ou JS). Do ponto de vista do usuário, é como pedir para o agente "salvar isso no schema":

```
Usuário: "Salva esse cálculo de churn rate no data model"
         ↓
Agente: adiciona measure no arquivo YAML
         ↓
Git commit automático (branch de dev)
         ↓
Deploy via CI/CD para produção
```

### 4.2 Criar e Organizar Workbooks
O agente constrói tabs em workbooks com queries e visualizações baseado em linguagem natural. Do Analytics Chat, o usuário pode clicar em "Explore" para abrir o resultado num workbook completo.

### 4.3 Criar Dashboards
O agente cria dashboards organizando widgets de charts, tables e o widget de **AI Summary** (que ele mesmo gera — um parágrafo em linguagem natural resumindo os dados do dashboard).

### 4.4 IDE de Data Modeling com IA
No Cube Cloud IDE (browser), o agente pode **criar cubes e views do zero** a partir de uma descrição em linguagem natural:
> "Cria um cube para análise de churn de clientes com as métricas básicas de SaaS"

O agente gera o YAML, commita no branch de dev, e o usuário pode revisar e fazer merge.

### 4.5 Resumo de Capacidades Bidirecionais

| Ação | Gatilho |
|---|---|
| Criar measures/dimensions | "Crie uma métrica de..." no chat |
| Criar calculated fields ad-hoc | Perguntas que necessitam de cálculos derivados |
| Salvar no data model | "Salva isso no schema" |
| Criar tab em workbook | "Cria um relatório de..." |
| Construir dashboard | "Monta um dashboard de..." |
| Gerar AI Summary widget | Prompt customizável no dashboard builder |
| Criar cube via IDE | Descrição no IDE com IA |

---

## 5. Configuração do Agente (Code-First)

```
projeto/
├── model/
│   └── cubes/
│       └── orders.yml
├── agents/
│   ├── config.yml               ← Configuração principal
│   ├── rules/
│   │   └── fiscal-year.md       ← Regras de comportamento
│   └── certified_queries/
│       └── quarterly-revenue.md ← Queries SQL de referência
└── cube.py
```

### `agents/config.yml` — Configuração
```yaml
llm: claude_4_sonnet            # ou gpt_5, claude_4_7_opus, etc.
runtime: plain                   # plain | reasoning (extended thinking)
accessible_views:
  - orders_view
  - customers_view
memory_mode: user                # space | user | disabled
```

### LLMs disponíveis nativos
**Anthropic Claude:** `claude_3_5_sonnetv2`, `claude_3_7_sonnet`, `claude_3_7_sonnet_thinking`, `claude_4_sonnet`, `claude_4_5_sonnet`, `claude_4_5_haiku`, `claude_4_5_opus`, `claude_4_6_sonnet`, `claude_4_6_opus`, `claude_4_7_opus`

**OpenAI:** `gpt_4o`, `gpt_4_1`, `gpt_5`, `gpt_5_mini`, `o3`, `o4_mini`

**BYOM (Bring Your Own Model):** Anthropic, OpenAI, AWS Bedrock, GCP Vertex AI, Databricks, Snowflake Cortex

### `agents/rules/` — Guias de Comportamento
```markdown
---
type: always   # always | agent_requested
---
Sempre usar ano fiscal começando em abril.
Q1 = Abril–Junho, Q2 = Julho–Setembro...
```

### `agents/certified_queries/` — Exemplos SQL de Referência
```markdown
---
user_request: "Qual é a receita por quarter?"
---
SELECT DATE_TRUNC('quarter', order_date), SUM(amount)
FROM orders WHERE status != 'cancelled'
GROUP BY 1 ORDER BY 1
```

---

## 6. Sistema de Memória

O agente tem memória persistente entre conversas, implementada com vector store (embeddings):

```
Usuário: "Quando falo em receita, exclua sempre os chargebacks"
         ↓
Agente armazena como memória vetorial
         ↓
Próxima sessão: agente recupera e aplica automaticamente
```

**Modos de isolamento:**

| `memory_mode` | Comportamento |
|---|---|
| `space` (padrão) | Memórias compartilhadas entre todos usuários do space |
| `user` | Memórias isoladas por usuário |
| `disabled` | Sem persistência entre sessões |

**Segurança:** Cada request carrega JWT tenant-bound. Vector searches filtram por tenant + user automaticamente.

---

## 7. AI Context no Data Model

O data model pode ser enriquecido com contexto específico para o agente:

```yaml
measures:
  - name: total_revenue
    sql: amount
    type: sum
    description: Total revenue from completed orders  # visível no UI + para o agente
    meta:
      ai_context: >
        Este é o principal KPI de receita. Quando o usuário
        falar em "vendas", use esta measure.
        Não inclua chargebacks (status = 'refunded').
```

`meta.ai_context` é **invisível no UI**, mas injetado no contexto do LLM a cada request.

---

## 8. Multi-Agent

Para deployments com múltiplas equipes, é possível criar agentes especializados com contextos isolados:

```yaml
# agents/config.yml
spaces:
  - name: sales-analytics
  - name: marketing-analytics

agents:
  - name: sales-assistant
    space: sales-analytics
    llm: claude_4_6_sonnet
    accessible_views: [orders_view, customers_view]

  - name: marketing-analyst
    space: marketing-analytics
    llm: gpt_5
```

Cada space tem suas próprias Rules, Certified Queries e Memórias isoladas.

---

## 9. Chat API — Interface de Integração

### Endpoint
```
POST https://ai.{cloudRegion}.cubecloud.dev/api/v1/public/{account}/agents/{agentId}/chat/stream-chat-state
```

### Request
```javascript
{
  input: "Qual foi a receita total do último mês?",
  chatId: "opcional-para-continuar-thread",
  sessionSettings: {
    externalId: "user@example.com",
    userAttributes: [{ name: "region", value: "south" }]
  }
}
```

### Response (NDJSON streaming)
```jsonl
{"id":"__cutoff__","state":{"isStreaming":false},"sort":0}
{"id":"abc","role":"user","content":"Qual foi a receita...","sort":1}
{"id":"xyz","role":"assistant","thinking":"O usuário quer...","graphPath":["cube_data_analyst_agent"],"isInProcess":true,"sort":2}
{"id":"tool1","toolCall":{"name":"cubeMeta","input":"{\"searchQuery\":\"receita\"}"},"graphPath":["cube_data_analyst_agent","tools"],"sort":3}
{"id":"tool1","toolCall":{"name":"cubeMeta","result":"{\"cubes\":[...]}"},"isInProcess":false,"sort":4}
{"id":"tool2","toolCall":{"name":"cubeSqlApi","input":"{\"sqlQuery\":\"SELECT ...\",\"vegaSpec\":\"...\"}"},"sort":5}
{"id":"tool2","toolCall":{"name":"cubeSqlApi","result":"{\"data\":[[2400000]],\"totalRows\":1}"},"isInProcess":false,"sort":6}
{"id":"xyz","role":"assistant","content":"A receita do último mês foi R$2,4M...","graphPath":["final"],"isInProcess":false,"sort":9}
```

### Abort
```
POST /chat/abort
{ chatId: "...", sessionSettings: { externalId: "..." } }
```

---

## 10. Integração via MCP (Model Context Protocol)

O Cube expõe um servidor MCP para conectar IDEs com IA diretamente:

```bash
# Claude Code
claude mcp add --transport http cube-mcp-server https://<host>/api/mcp

# Cursor / Codex
{ "mcpServers": { "cube-mcp-server": { "command": "npx", "args": ["-y", "mcp-remote", "https://<host>/api/mcp"] } } }
```

Fluxo: autenticação OAuth (Authorization Code + PKCE) → conversa com o agente no IDE.

---

## 11. Agent-to-Agent: Cube como Tool de um Agente Externo

O Cube Chat API pode ser usado como **ferramenta de um agente externo** (LangChain, LlamaIndex, CrewAI):

```python
@tool
def ask_cube(question: str) -> str:
    """Use para qualquer pergunta sobre dados de negócio — receita, KPIs, trends."""
    response = requests.post(CHAT_API_URL, json={
        "input": question,
        "sessionSettings": { "externalId": "orchestrating-agent" }
    }, stream=True)

    messages = [json.loads(line) for line in response.iter_lines() if line]
    final = [m for m in messages if m.get("graphPath", [""])[0] == "final"]
    return final[-1]["content"] if final else ""

agent = create_react_agent(ChatOpenAI("gpt-4o"), [ask_cube])
```

**Benefícios:**
- Separação de responsabilidades: agente externo → lógica de conversa; Cube → acesso a dados
- RLS e access policies enforced automaticamente pelo Cube
- Multi-turn via `chatId`

---

## 12. Embedding no Frontend

### Iframe (mais simples)
```html
<iframe src="https://your-account.cubecloud.dev/embed/chat?sessionId=SID" />
```

### React Embed SDK (preview)
```jsx
import { CubeEmbedProvider } from "@cube-dev/embed-sdk";

<CubeEmbedProvider apiUrl="https://your-account.cubecloud.dev" sessionId={sid}>
  {/* componentes embedded */}
</CubeEmbedProvider>
```

### Creator Mode (full app embedded)
Embed do produto completo — workbooks, dashboards, chat — dentro de um iframe do seu produto.

---

## 13. O Que NÃO Está no Open-Source

| Feature | Onde fica |
|---|---|
| Agent / LLM backend | Cube Cloud (`ai.*.cubecloud.dev`) |
| Analytics Chat (UI) | Cube Cloud |
| Workbooks/Dashboards (UI) | Cube Cloud |
| Memory (vector store) | Cube Cloud |
| MCP Server | Cube Cloud |
| Visual Modeler | Cube Cloud (Premium+) |
| Chat API | Cube Cloud (Premium+) |

**O open-source contém:**
- Schema Compiler (compila YAML/JS → queries)
- Query Orchestrator (executa queries, gerencia cache)
- API Gateway (REST, GraphQL, SQL)
- CubeStore (storage engine em Rust)
- CubeSQL (Postgres-compatible SQL interface em Rust)
- Drivers de banco (Postgres, BigQuery, Snowflake, ClickHouse, etc.)
- Playground básico (geração de schema por seleção de tabelas — sem IA real)

---

## 14. Pontos Interessantes

### Vega-Lite como linguagem de gráficos da IA
O agente não usa um sistema de charts proprietário — ele gera specs Vega-Lite v5. O frontend renderiza o `vegaSpec` retornado pelo `cubeSqlApi`. Isso torna o sistema extensível e independente de lib de charts.

### AI Summary Widget com Staleness Detection
O widget de AI Summary em dashboards mantém um **checksum do estado do dashboard** (queries, controles, configurações). Quando qualquer coisa muda, marca o sumário como stale e mostra botão de refresh — sem regenerar desnecessariamente.

### Token Economics como Billing Proxy
Tokens de IA funcionam como currency do Cube Cloud. Uma pergunta pode gerar múltiplos tool calls internos (cubeMeta + cubeSqlApi × N), cada um consumindo tokens. Isso é billing por complexidade real de uso.

### Runtime "Reasoning" (Experimental)
```yaml
runtime: reasoning  # extended thinking para análises complexas
```
Provavelmente mapeia para o modo de extended thinking do Claude — o agente raciocina mais antes de responder, com maior custo de tokens.

### Certified Queries como Few-Shot Prompting
As Certified Queries não são respostas fixas — são exemplos SQL que o agente usa como referência (few-shot). O agente pode adaptá-las, expandí-las ou usá-las como ponto de partida. É uma forma de injetar domain knowledge no LLM de forma estruturada e versionável.

### Regras como Prompt Engineering Versionável
As Rules em `agents/rules/` são essencialmente um sistema de prompt engineering gerenciado como código. `type: always` = system prompt fixo. `type: agent_requested` = prompt condicional que o agente mesmo decide quando aplicar.
