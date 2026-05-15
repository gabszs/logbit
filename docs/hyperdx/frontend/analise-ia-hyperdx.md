# HyperDX — Análise da Implementação de IA

## Visão Geral

O HyperDX tem **dois sistemas de IA** com naturezas completamente diferentes:

1. **AI Assistant (Chart Generator)** — IA real via LLM. Recebe linguagem natural e gera configuração completa de chart que interage de volta com o sistema (executa query, pode ser salvo em dashboard).
2. **AI Summarize** — Easter egg sem LLM real. Gera resumos narrativos temáticos de spans/logs usando pools de frases pré-escritas. Ativo até abril 2026.

---

## 1. AI Assistant — O Sistema Principal

### 1.1 O que é

O usuário digita uma frase em linguagem natural como:

> "Error counts by service over last 2 hours"

E o sistema gera automaticamente uma configuração de chart completa — tipo de visualização, funções de agregação, filtros, período temporal, agrupamentos — que é executada imediatamente contra o ClickHouse.

A IA **interage de volta com o sistema**: o chart gerado pode ser executado e salvo em dashboards existentes ou novos.

---

### 1.2 Arquivos Envolvidos

| Camada | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| UI | `packages/app/src/DBChartPage.tsx:47-206` | Componente `AIAssistant` — input, botão, estado |
| Hook | `packages/app/src/hooks/ai.ts` | `useChartAssistant()` — mutation TanStack Query |
| Router | `packages/api/src/routers/api/ai.ts` | `POST /api/ai/assistant` — validação + orquestração |
| Controller | `packages/api/src/controllers/ai.ts` | Prompt building, metadata, chamada LLM, conversão |
| Metadata | `packages/common-utils/src/core/metadata.ts` | `getAllFields()`, `getKeyValues()`, `getTableMetadata()` |
| Schemas | `packages/common-utils/src/types.ts:1143-1242` | `AssistantLineTableConfigSchema`, `AILineTableResponse` |
| Config | `packages/api/src/config.ts` | `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL_NAME` |

---

### 1.3 Fluxo de Arquitetura

```
Usuário digita texto
        │
        ▼
[Frontend] DBChartPage.tsx
  AIAssistant component
  ├── SourceSelectControlled (escolhe Log ou Trace source)
  ├── Input text (ex. "Error counts by service last 2h")
  └── Botão "Generate" → useChartAssistant().mutate()
        │
        ▼ POST /api/ai/assistant
        │  body: { sourceId, text }
        │
[Backend] routers/api/ai.ts
  ├── Valida body com Zod: text (max 10k), sourceId (ObjectId)
  ├── getAIModel() → instancia provider configurado
  ├── getSource() → carrega metadata do source (type, expressions)
  ├── getAIMetadata(source)
  │     ├── getAllFields() → schema completo do ClickHouse
  │     │     ├── colunas simples (getColumns)
  │     │     ├── chaves de Map (getMapKeys)
  │     │     └── caminhos de JSON (getJSONKeys)
  │     └── getKeyValues() → top 20 valores de cada campo (amostra 3M rows)
  ├── Monta prompt com:
  │     ├── instrução do sistema (role, plataforma, guidelines)
  │     ├── tipo do source (Log/Trace/Metric)
  │     ├── expressões do source (severity, duration, body, service...)
  │     └── campos + valores de exemplo do ClickHouse
  ├── generateText({ model, output: Output.object({ schema }) })
  │     └── AssistantLineTableConfigSchema (Zod → structured output)
  └── getChartConfigFromResolvedConfig()
        ├── parseTimeRangeInput() via chrono-node
        └── retorna AILineTableResponse (JSON)
        │
        ▼ resposta JSON
        │
[Frontend] DBChartPage.tsx
  onSuccess(data):
  ├── setConfig({ ...data, where: '' })  → atualiza URL state via nuqs
  ├── onTimeRangeSelect(dateRange)        → atualiza período
  └── submitRef.current()                 → auto-submete o form de chart
        │
        ▼
[Frontend] EditTimeChartForm.tsx
  ├── Executa query contra ClickHouse (via proxy)
  ├── Renderiza o chart (line ou table)
  └── Botão "Save to Dashboard" → SaveToDashboardModal
        │
        ▼ Interação de volta com o sistema
[Frontend] SaveToDashboardModal.tsx
  ├── Lista dashboards existentes ou opção "Create New"
  ├── useUpdateDashboard() → adiciona tile ao dashboard existente
  └── useCreateDashboard() → cria dashboard novo com o chart como primeiro tile
```

---

### 1.4 Bibliotecas Utilizadas

| Lib | Versão | Uso |
|-----|--------|-----|
| `ai` (Vercel AI SDK) | `^6.0.116` | `generateText()`, `Output.object()`, `APICallError` |
| `@ai-sdk/anthropic` | `^3.0.58` | Provider Anthropic / Azure AI |
| `@ai-sdk/openai` | `^3.0.47` | Provider OpenAI-compatible |
| `chrono-node` | `^2.9.0` | Parse de datas em linguagem natural ("Past 2h", "last week") |
| `zod` | — | Schema de validação + structured output para o LLM |
| `nuqs` | `1.17.0` | URL state — sincroniza config do chart com a URL |
| `@tanstack/react-query` | — | `useMutation` para a chamada de IA no frontend |

---

### 1.5 Providers de LLM Suportados

Configurados via variáveis de ambiente:

```
AI_PROVIDER=anthropic | openai
AI_API_KEY=sk-...
AI_BASE_URL=(opcional, ex. Azure AI endpoint)
AI_MODEL_NAME=(opcional, ex. gpt-4o)
AI_REQUEST_HEADERS=(opcional, JSON de headers extras)

# Legado (backward compat)
ANTHROPIC_API_KEY=sk-ant-...
```

**Anthropic** (padrão se nada configurado e `ANTHROPIC_API_KEY` existe):
- Modelo default: `claude-sonnet-4-5-20250929`
- Suporta endpoint customizado (`AI_BASE_URL`) para Azure AI Anthropic

**OpenAI-compatible** (qualquer provider com API `/v1/responses`):
- Requer `AI_MODEL_NAME` explícito
- Suporta headers extras (útil para LiteLLM proxies)

A flag `me.aiAssistantEnabled` é calculada no backend:
```ts
// packages/api/src/routers/api/me.ts
aiAssistantEnabled: !!(AI_API_KEY || ANTHROPIC_API_KEY)
```
Se nenhuma chave estiver configurada, o frontend mostra um alerta informando como ativar.

---

### 1.6 Como o Prompt é Construído

O prompt tem três seções principais:

**1. Instrução do sistema** — descreve o papel, a plataforma e as regras:
```
You are an AI assistant that helps users create chart configurations
for an observability platform called HyperDX.
Guidelines:
- Use 'line' for time series, 'table' for tabular data
- Use count/sum/avg/min/max/count_distinct
- If user requests specific data (ex. "frontend service"), filter
  by the appropriate property (ex. ServiceName = 'frontend')
- Pick time range from user's request if inferrable
```

**2. Contexto do source** — expressões específicas do dataset:
```
The user is querying: "production-logs" (type: Log)
Log level: SeverityText
Log body: Body
Service: ResourceAttributes['service.name']
Attributes: LogAttributes, ResourceAttributes
```

**3. Schema real do ClickHouse** — até 30 campos com valores de exemplo:
```json
[
  { "key": "SeverityText", "value": ["ERROR", "INFO", "WARN", "DEBUG"] },
  { "key": "ServiceName", "value": ["api", "frontend", "worker"] },
  { "key": "LogAttributes['http.status_code']", "value": ["200", "404", "500"] }
]
```
Os campos são ordenados: primary keys primeiro, depois baixa cardinalidade (LowCardinality).

---

### 1.7 O Schema de Saída Estruturada

O LLM **não retorna texto livre** — retorna um objeto JSON validado pelo Zod via `Output.object()` do Vercel AI SDK:

```ts
// AssistantLineTableConfigSchema
{
  displayType: "line" | "table",
  markdown?: string,           // Descrição opcional do chart
  select: [{
    aggregationFunction: "avg" | "count" | "count_distinct" | "last_value"
                       | "max" | "min" | "quantile" | "sum" | "any" | "none",
    property: string,          // Coluna ou expressão (ex. "Duration")
    condition?: string,        // Filtro SQL (ex. "SeverityText = 'error'")
  }],
  groupBy?: string,            // Agrupamento (ex. "ServiceName")
  timeRange: string,           // "Past 1h", "Past 24h", "last week"...
}
```

Essa saída é convertida em `AILineTableResponse` por `getChartConfigFromResolvedConfig()`:
- `timeRange` → `chrono-node` faz parse para `[Date, Date]`
- `select[]` → mapeado para o formato interno `{ aggFn, valueExpression, aggCondition }`
- Adiciona `from`, `connection`, `timestampValueExpression` do source original

---

### 1.8 A IA Interage de Volta com o Sistema?

**Sim, de duas formas:**

**1. Execução automática do chart:**
Após receber a resposta, o frontend chama `submitRef.current()` depois de 100ms, o que auto-submete o formulário de chart. Isso dispara a query real contra o ClickHouse. O chart aparece imediatamente na tela, sem o usuário precisar clicar em "Run".

**2. Salvamento em dashboard:**
O `EditTimeChartForm` tem um botão "Save to Dashboard" que abre o `SaveToDashboardModal`. O modal permite:
- Adicionar o chart como tile em um dashboard **existente** (`useUpdateDashboard()`)
- Criar um **dashboard novo** com o chart como primeiro tile (`useCreateDashboard()`)

Fluxo completo da interação de volta:
```
Texto natural → LLM → JSON → setConfig() → URL (nuqs) → form submit →
→ query ClickHouse → chart renderizado → Save to Dashboard →
→ tile adicionado no dashboard (persistido no banco)
```

O chart gerado pela IA é **indistinguível** de um chart criado manualmente. Usa o mesmo `SavedChartConfig`, o mesmo sistema de dashboard tiles, as mesmas queries.

---

### 1.9 Telemetria da Chamada de IA

A chamada ao LLM tem OTel habilitado:
```ts
generateText({
  model,
  output: Output.object({ schema: AssistantLineTableConfigSchema }),
  experimental_telemetry: { isEnabled: true },
  prompt,
})
```
Isso gera spans de trace para cada inferência, que o próprio HyperDX pode monitorar.

---

## 2. AI Summarize — Easter Egg (Sem LLM Real)

### 2.1 O que é

Um botão no side panel de spans/logs que gera um resumo narrativo do evento em estilo temático. **Não faz chamada de LLM** — é geração local de texto com pools de frases pré-escritas.

### 2.2 Três Temas

| Tema | Quando | Exemplo |
|------|--------|---------|
| **Detective Noir** | Erros, falhas | *"In the harsh rain of the data center, the request never made it home..."* |
| **Nature Documentary (Attenborough)** | Eventos normais | *"Here in the savanna of the distributed system, the humble request goes about its business..."* |
| **Shakespearean Drama** | Requisições lentas, warnings | *"What light through yonder load balancer breaks? It is the East, and latency is the sun."* |

### 2.3 Fluxo

```
Clique no botão
      │
      ▼
extractFacts(rowData)
  └── Lê atributos OTel do span:
      ServiceName, Duration, StatusCode, SeverityText
      http.method, http.url, http.status_code
      db.system, db.statement
      rpc.service, rpc.method
      messaging.system
      exception.type, exception.message
      k8s.pod.name, k8s.namespace.name
      resource: service.name, service.version, host.name
      │
      ▼
classifyMood(facts) → "error" | "warn" | "slow" | "normal"
      │
      ▼
selectTheme(mood)
  error  → noir (majoritariamente) ou shakespeare
  warn   → noir ou shakespeare
  slow   → shakespeare (majoritariamente) ou attenborough
  normal → attenborough (majoritariamente) com chance de outros
      │
      ▼
THEME_FNS[theme](facts, mood)
  → frases aleatórias de pool pré-escrito, preenchidas com dados reais
      │
      ▼
Exibe no AISummaryPanel com animação de "gerando..."
```

### 2.4 Visibilidade (Gate de Data)

```ts
// helpers.ts
const ALWAYS_ON_END = new Date('2026-04-07T00:00:00')  // Apr 1-6: sempre visível
const HARD_OFF      = new Date('2026-05-01T00:00:00')  // Mai+: desligado

// Abr 7-30: visível apenas com ?smart=true na URL
```

O usuário pode dispensar o botão (botão "Dismiss") que salva `hdx-ai-summarize-dismissed=1` no `localStorage`.

### 2.5 Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `components/aiSummarize/logic.ts` | `extractFacts()`, `classifyMood()`, `selectTheme()`, `generateSummary()` |
| `components/aiSummarize/helpers.ts` | Gate de data, tipos `EventFacts`, `Mood`, `Theme` |
| `components/aiSummarize/attenboroughTheme.ts` | Pool de frases Nature Documentary |
| `components/aiSummarize/shakespeareTheme.ts` | Pool de frases Shakespearean |
| `components/aiSummarize/noirTheme.ts` | Pool de frases Detective Noir |
| `components/aiSummarize/AISummaryPanel.tsx` | UI do painel com animação |
| `components/AISummarizeButton.tsx` | Botão para spans/logs individuais |
| `components/AISummarizePatternButton.tsx` | Botão para grupos de padrões |

---

## 3. Comparativo dos Dois Sistemas

| | AI Assistant | AI Summarize |
|--|--|--|
| **LLM real** | Sim | Não |
| **Interação com sistema** | Sim — executa query + salva em dashboard | Não — só exibe texto |
| **Localização** | Chart Explorer (`/chart`) | Side panel de spans/logs |
| **Trigger** | Input de texto + botão "Generate" | Botão por span/log |
| **Output** | Config de chart estruturado (JSON) | Texto narrativo |
| **Providers** | Anthropic, OpenAI-compatible | Nenhum |
| **Persistência** | Chart salvo em dashboard | Nenhuma |
| **Estado** | Produção | Easter egg temporário |

---

## 4. Pontos Arquiteturais Interessantes

### 4.1 Structured Output via Vercel AI SDK

O HyperDX usa `Output.object({ schema })` do AI SDK v6 para forçar o LLM a retornar JSON válido contra um schema Zod. Isso elimina o problema de parsear texto livre e garante que o output pode ser diretamente deserializado e usado pelo sistema.

```ts
const result = await generateText({
  model,
  output: Output.object({ schema: AssistantLineTableConfigSchema }),
  experimental_telemetry: { isEnabled: true },
  prompt,
});
// result.output já é um objeto TypeScript tipado
```

### 4.2 Schema-Awareness via Metadata

O prompt é enriquecido com o schema real do ClickHouse: campos, tipos, e até **valores de exemplo** reais (até 20 valores por campo, amostrado nos últimos 60 minutos). Isso permite o LLM referenciar campos exatos e valores reais sem alucinações.

Os campos são priorizados: primary keys primeiro, depois `LowCardinality` (alta usabilidade, pouca cardinalidade), depois o restante. Apenas os 30 primeiros campos são enviados para não exceder o context window.

### 4.3 Abstração de Provider

O design permite trocar de Anthropic para qualquer OpenAI-compatible sem alterar o código de negócio. `getAIModel()` retorna um `LanguageModel` genérico do AI SDK, e o resto do código não sabe qual provider está sendo usado.

Isso inclui suporte a LiteLLM, Azure AI, e proxies customizados via `AI_BASE_URL` + `AI_REQUEST_HEADERS`.

### 4.4 State Management da Resposta via URL

Após o LLM responder, o chart config é persistido na URL via `nuqs`:
```ts
const [chartConfig, setChartConfig] = useQueryState(
  'config',
  parseAsJson<SavedChartConfig>().withDefault(...)
)
```

Isso significa que o chart gerado pela IA é **linkável** — o usuário pode copiar a URL e compartilhar exatamente a mesma visão com um colega.

### 4.5 Parsing de Datas Naturais

O LLM retorna `timeRange` como string natural ("Past 2h", "last week", "yesterday afternoon"). O backend usa `chrono-node` para converter isso em `[Date, Date]`:

```ts
function parseTimeRangeInput(str: string): [Date | null, Date | null] {
  const results = chrono.parse(str);
  // Normaliza futuros → passado (ano anterior)
  // Infere "end = agora" quando não especificado
}
```

Há lógica de normalização para casos onde o parser infere datas futuras (ajusta para o ano anterior).

### 4.6 Auto-Submit com Delay Deliberado

Após aplicar o config via `setConfig()`, o código aguarda 100ms antes de submeter:
```ts
setTimeout(() => {
  if (submitRef.current) submitRef.current();
}, 100);
```
O comentário no código é: `// FIXME: This is a hack to submit after the form has been updated`. O delay existe porque o state do React (via URL/nuqs) precisa propagar antes que o submit leia os valores corretos.

### 4.7 OTel na Própria Inferência

A chamada de IA tem `experimental_telemetry: { isEnabled: true }` — ou seja, cada inferência do LLM gera spans OTel que o próprio HyperDX pode monitorar. A plataforma de observabilidade observa a si mesma.
