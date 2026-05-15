# Evidence.dev — Análise de Arquitetura de IA e Demo

> Análise técnica do projeto em `otel/evidence` com foco na feature de geração de ações (Copilot-like), fluxo de dados, libs usadas e interatividade bidirecional.

---

## 1. O que é Evidence

Evidence é uma ferramenta open-source de BI/analytics onde o autor escreve **relatórios como código**. A interface principal é um arquivo Markdown (`.md`) que contém:

- **SQL embutido** em blocos de código para consultar dados
- **Componentes Svelte** declarativos para renderizar gráficos, tabelas, filtros, mapas etc.
- **Frontmatter YAML** para metadados e configuração de queries externas

O resultado é uma aplicação SvelteKit estática (ou SSR) gerada a partir desses arquivos — sem backend de runtime para as queries, pois o motor de execução SQL roda **no browser via DuckDB WASM**.

Stack: **SvelteKit + DuckDB WASM + CodeMirror + Tailwind + pnpm monorepo**

---

## 2. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTOR (Dev)                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         VSCode + Extensão Evidence                      │   │
│  │  - Slash Commands (/ → gera componentes)                │   │
│  │  - SQL Autocomplete (DuckDB keywords + schema)          │   │
│  │  - Component Prop Autocomplete                          │   │
│  │  - Schema Viewer (tabelas/colunas do projeto)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│              escreve arquivo .md (emd)                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BUILD TIME (Node.js)                          │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  @evidence-dev/preprocess (Svelte preprocessor)        │    │
│  │  - Extrai blocos SQL do Markdown                       │    │
│  │  - Converte Markdown → componentes Svelte              │    │
│  │  - Injeta imports automáticos de componentes           │    │
│  │  - Gera rotas SvelteKit a partir de /pages/*.md        │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  @evidence-dev/universal-sql                           │    │
│  │  - Executa as queries SQL contra as data sources       │    │
│  │  - Serializa resultados em Parquet                     │    │
│  │  - Gera manifest.json com schema de tabelas            │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                            │
              gera bundle SvelteKit estático
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RUNTIME (Browser)                            │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  DuckDB WASM (@duckdb/duckdb-wasm)                     │    │
│  │  - Carrega arquivos .parquet via HTTP                  │    │
│  │  - Executa queries SQL in-browser                      │    │
│  │  - Serve como banco reativo para os componentes        │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  @evidence-dev/core-components (Svelte)                │    │
│  │  - LineChart, BarChart, DataTable, Value, BigValue     │    │
│  │  - Dropdown, TextInput, Slider, DateRange, Checkbox    │    │
│  │  - PointMap, AreaMap, BubbleMap, Heatmap               │    │
│  │  - SqlConsole (editor interativo)                      │    │
│  │  - SchemaExplorer (visualizador de schema)             │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. A Feature "Copilot" — Slash Commands

### 3.1 O que é

A feature Copilot-like do Evidence **não usa LLM**. É um sistema de **slash commands baseado em regras** implementado na extensão VSCode (`packages/extension`). Quando o usuário está em uma nova linha vazia em um arquivo `.md`, a extensão mostra um hint sutil:

```
Press / for commands...    ← aparece em cinza após o cursor
```

Digitando `/` e o nome do componente, o editor insere um snippet completo com placeholders de edição (tab stops do VSCode).

### 3.2 Como funciona tecnicamente

**Arquivo principal:** [packages/extension/src/extension.ts](../otel/evidence/packages/extension/src/extension.ts)

```typescript
// Mostra o hint "Press / for commands..." em linhas vazias
const decorationType = window.createTextEditorDecorationType({
    after: {
        contentText: ' Press / for commands...',
        color: '#99999959'
    }
});

function decorate(editor: TextEditor) {
    const { text } = editor.document.lineAt(editor.selection.active.line);
    // Ativa hint apenas em linhas vazias ou só com espaços
    if (text === undefined || /^\s*$/.test(text)) {
        decorationsArray.push(decoration);
        commands.executeCommand(Commands.SetContext, Context.isNewLine, true);
    }
}
```

O hint é mostrado dinamicamente via `onDidChangeTextEditorSelection` e `onDidChangeTextDocument` — a extensão rastreia posição do cursor em tempo real.

**Snippets registrados:** [packages/extension/snippets/emd.code-snippets](../otel/evidence/packages/extension/snippets/emd.code-snippets)

### 3.3 Catálogo completo de slash commands

| Comando | Snippet gerado |
|---------|---------------|
| `/SQL Query Block` | ` ```sql query_name \n query \n``` ` |
| `/LineChart` | `<LineChart data={query} x=col y=col/>` |
| `/BarChart` | `<BarChart data={query} x=col y=col/>` |
| `/AreaChart` | `<AreaChart data={query} x=col y=col/>` |
| `/ScatterPlot` | `<ScatterPlot data={query} x=col y=col/>` |
| `/BubbleChart` | `<BubbleChart data={query} x=col y=col size=col/>` |
| `/Histogram` | `<Histogram data={query} x=col/>` |
| `/BoxPlot` | `<BoxPlot data={query} name=col min=col .../>` |
| `/Heatmap` | `<Heatmap data={query} x=col y=col value=col/>` |
| `/CalendarHeatmap` | `<CalendarHeatmap data={query} date=col value=col/>` |
| `/DataTable` | `<DataTable data={query}/>` |
| `/DataTableWithColumns` | `<DataTable data={query}><Column .../></DataTable>` |
| `/Value` | `<Value data={query} column=col fmt=usd/>` |
| `/BigValue` | `<BigValue data={query} column=col/>` (BigNumber KPI) |
| `/Delta` | `<Delta data={query} column=col fmt=usd/>` |
| `/Sparkline` | `<Sparkline data={query} dateCol=col valueCol=col/>` |
| `/DimensionGrid` | `<DimensionGrid data={query}/>` |
| `/Dropdown` | `<Dropdown data={query} name=name value=col/>` |
| `/DropdownWithFilteredQuery` | Dropdown + query SQL com `WHERE col = '${inputs.name}'` |
| `/DropdownMultiSelect` | `<Dropdown multiple=true .../>` |
| `/ButtonGroup` | `<ButtonGroup data={query} name=name value=col/>` |
| `/TextInput` | `<TextInput name=name title=Search/>` |
| `/DateRange` | `<DateRange name=name data={query} dates=col/>` |
| `/Slider` | `<Slider name=name min=0 max=100/>` |
| `/Checkbox` | `<Checkbox name=name title=Checkbox/>` |
| `/PointMap` | `<PointMap data={query} lat=col long=col value=col/>` |
| `/AreaMap` | `<AreaMap data={query} geoJsonUrl='...' .../>` |
| `/BubbleMap` | `<BubbleMap data={query} lat=col long=col size=col/>` |
| `/BaseMap` | `<BaseMap><Areas .../><Points .../></BaseMap>` |
| `/Chart` (composable) | `<Chart data={query} x=col y=col><Line/></Chart>` |
| `/LineChartWithAnnotations` | LineChart + ReferenceLine + ReferenceArea |
| `/Grid` | `<Grid cols=2>...</Grid>` |
| `/Group` | `<Group>...</Group>` |
| `/Each Block` | `{#each query as row}...<Value data={row}...>{/each}` |
| `/If Block` | `{#if query.length > 10}...{/if}` |
| `/Filtered Query Result` | `query.filter(d => d.col === 'value')` |
| `/Modal` | `<Modal title='...' buttonText='...'>...</Modal>` |
| `/Accordion` | `<Accordion><AccordionItem>...</AccordionItem></Accordion>` |
| `/Frontmatter` | Bloco YAML `---title: ...\nqueries:...---` |
| `/DownloadData` | `<DownloadData data={query} text='Download'/>` |
| `/Note` | `<Note>...</Note>` |
| `/Embed` | `<Embed url={query}/>` |
| `/PageBreak` | `<PageBreak/>` (PDF/print) |
| `/PrintGroup` | `<PrintGroup hidden=false>...</PrintGroup>` |
| `/LastRefreshed` | `<LastRefreshed/>` |
| `/Code Block` | Bloco de código genérico |
| `/LineBreak` | `<LineBreak lines=1/>` |

---

## 4. Autocomplete SQL com Consciência de Schema

### 4.1 Autocomplete de Keywords DuckDB

A extensão registra um `CompletionItemProvider` para arquivos `.emd` e `.sql`. Dentro de blocos SQL, sugere automaticamente keywords DuckDB (`SELECT`, `FROM`, `GROUP BY`, `PARTITION BY`, `PIVOT`...) e funções com snippets:

```typescript
// packages/extension/src/extension.ts:710
async function provideSQLCompletionItems(document, position, context) {
    // Se cursor após FROM/JOIN: sugere tabelas do schema
    const fromMatch = fromPattern.exec(textBeforePosition);
    const joinMatch = joinPattern.exec(textBeforePosition);
    
    // Se cursor após ${inputs.: sugere nomes de inputs declarados
    const inputMatch = /\$\{inputs\.$/.exec(textBeforePosition);
    
    // Caso contrário: keywords + funções DuckDB
}
```

Funções com snippets incluídas: `DATE_TRUNC`, `SUM`, `COUNT`, `AVG`, `LAG`, `LEAD`, `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `PIVOT`, `CASE/WHEN`, `COALESCE`, `NULLIF`, `CORR`, `FILTER`, `ARRAY_AGG`, `CAST`, etc.

### 4.2 Schema Awareness

O schema é carregado do `manifest.json` gerado no build:

```
.evidence/template/static/data/manifest.json
```

Ele contém as tabelas e colunas disponíveis. A extensão usa um `SchemaViewProvider` (TreeView) para exibir isso em uma sidebar, e também alimenta o autocomplete SQL com os nomes reais de tabela e coluna do projeto.

### 4.3 Autocomplete de Props de Componentes

Dentro de tags `<ComponentName ...>`, a extensão sugere as props corretas com documentação inline:

```typescript
// packages/extension/src/extension.ts:866
async function provideComponentCompletionItems(document, position) {
    // Detecta que cursor está dentro de uma tag <Component
    // Carrega definições de props do props_list.json
    // Gera SnippetString com dropdown de opções válidas para cada prop
    for (const prop of componentDefinition.props) {
        item.insertText = new SnippetString(`${prop.name}=\${1|${options.join(',')}|}`);
        item.documentation = new MarkdownString(`**Type:** ${prop.type}\n\n**Default:** ${prop.defaultValue}`);
    }
}
```

As definições vêm de `packages/extension/src/props_list.json` — um JSON compilado com todos os componentes Evidence e seus props, tipos, descrições e valores padrão.

---

## 5. Interação Bidirecional: Inputs → Queries → Visualizações

### 5.1 O modelo reativo

Evidence implementa uma **interatividade bidirecional real** sem LLM. O padrão é:

```
[Input Component] → atualiza ${inputs.nome} → re-executa SQL → re-renderiza visualização
```

**Exemplo concreto** gerado pelo slash command `/DropdownWithFilteredQuery`:

```markdown
<!-- 1. Input que captura seleção do usuário -->
<Dropdown data={data} name=selected_category value=category/>

<!-- 2. Query parametrizada reativa ao input -->
```sql filtered_sales
select date, sum(revenue) as revenue
from sales
where category = '${inputs.selected_category.value}'
group by date
order by date
```

<!-- 3. Visualização que usa o resultado filtrado -->
<LineChart data={filtered_sales} x=date y=revenue/>
```

Quando o usuário muda o dropdown → o template `${inputs.selected_category.value}` é avaliado → a query é reexecutada contra o DuckDB WASM no browser → o gráfico re-renderiza com os novos dados. **Tudo no browser, zero round-trip ao servidor.**

### 5.2 Tipos de input e seus bindings

| Componente | Binding | Propriedades disponíveis |
|-----------|---------|--------------------------|
| `<Dropdown>` | `${inputs.nome.value}` | `.value`, `.label` |
| `<Dropdown multiple>` | `${inputs.nome}` | array de valores |
| `<TextInput>` | `${inputs.nome.value}` | string digitada |
| `<ButtonGroup>` | `${inputs.nome.value}` | valor do botão ativo |
| `<DateRange>` | `${inputs.nome.start}`, `${inputs.nome.end}` | datas de início/fim |
| `<Slider>` | `${inputs.nome.value}` | número atual |
| `<Checkbox>` | `${inputs.nome.value}` | `true`/`false` |

### 5.3 Interação no SQL Console (runtime)

O `SqlConsole` é um componente frontend que permite ao usuário final escrever e executar SQL diretamente na página:

```javascript
// packages/ui/core-components/src/lib/molecules/sql-console/sqlConsole.action.js
export const buildAutoCompletes = async () => {
    // Consulta information_schema.tables e .columns no DuckDB WASM
    // Retorna schema para alimentar o CodeMirror com autocomplete
    const columnsQuery = `
        SELECT concat(tables.table_schema, '.', tables.table_name) as qualifiedTable,
               column_name as label, ...
        FROM information_schema.tables
        INNER JOIN information_schema.columns ON ...`;
    
    // Retorna { schema: {table: [{label, type, detail}]}, tables: [...] }
}
```

O editor usa **CodeMirror 6** com extensões:
- `@codemirror/lang-sql` — syntax highlighting e autocomplete SQL
- `@codemirror/autocomplete` — engine de sugestões
- `thememirror` (espresso, boysAndGirls) — temas dark/light
- Keybindings customizados (`Ctrl+Enter` para executar)

O resultado é renderizado em um `<DataTable>` reativo abaixo do editor.

---

## 6. Pipeline de Transformação Markdown → Svelte

**Pacote:** `@evidence-dev/preprocess`

O preprocessador Svelte intercepta cada arquivo `.md` no build e:

1. **Extrai frontmatter** YAML (`parse-frontmatter.cjs`)
2. **Extrai blocos SQL** (` ```sql nome `) e registra como queries (`extract-queries.cjs`)
3. **Injeta script tags** com imports automáticos dos componentes Evidence (`add-script-tags.cjs`)
4. **Converte Markdown** para HTML/Svelte (`process-queries.cjs`)
5. **Injeta classes CSS** para estilização (`add-classes.cjs`)
6. **Resolve partials** — includes de outros arquivos `.md` (`inject-partials.cjs`)

Resultado: cada `pages/meu-relatorio.md` vira uma rota SvelteKit `pages/meu-relatorio/+page.svelte` totalmente funcional.

---

## 7. Motor SQL: DuckDB WASM

**Pacote:** `@evidence-dev/universal-sql` + `@duckdb/duckdb-wasm: 1.29.0`

```
Build time:
  Sources (PostgreSQL, BigQuery, CSV, DuckDB, Snowflake...)
      ↓ @evidence-dev/[datasource]
  Executa queries iniciais
      ↓
  Serializa em .parquet
      ↓
  Gera manifest.json com schema

Runtime (browser):
  DuckDB WASM carrega os .parquet via HTTP Range Requests
  buildQuery('SELECT ...') → Query reativa
  query.fetch() → executa no WASM in-browser
  resultado → alimenta componentes Svelte
```

O cliente browser está em `packages/lib/universal-sql/src/client-duckdb/browser.js`. O `buildQuery()` retorna um objeto store Svelte reativo — quando os dados chegam, todos os componentes que dependem dessa query re-renderizam automaticamente.

---

## 8. Datasources Suportados

| Pacote | Banco |
|--------|-------|
| `@evidence-dev/postgres` | PostgreSQL / Redshift |
| `@evidence-dev/mysql` | MySQL |
| `@evidence-dev/bigquery` | Google BigQuery |
| `@evidence-dev/snowflake` | Snowflake |
| `@evidence-dev/databricks` | Databricks |
| `@evidence-dev/motherduck` | MotherDuck (DuckDB cloud) |
| `@evidence-dev/duckdb` | DuckDB local |
| `@evidence-dev/sqlite` | SQLite |
| `@evidence-dev/mssql` | SQL Server |
| `@evidence-dev/trino` | Trino |
| `@evidence-dev/csv` | Arquivos CSV |
| `@evidence-dev/faker-datasource` | Dados fake (dev/demo) |
| `@evidence-dev/source-javascript` | Datasource customizada em JS |

---

## 9. Bibliotecas Principais

| Biblioteca | Versão | Papel |
|-----------|--------|-------|
| `svelte` | 4.2.19 | Framework UI |
| `@sveltejs/kit` | 2.8.4 | Framework de roteamento/build |
| `@duckdb/duckdb-wasm` | 1.29.0 | SQL engine no browser |
| `echarts` | 5.6.0 | Motor de gráficos (LineChart, BarChart etc.) |
| `echarts-stat` | 1.2.0 | Extensão ECharts para estatística |
| `@codemirror/lang-sql` | — | SQL editor no SqlConsole |
| `@codemirror/autocomplete` | — | Engine de autocomplete |
| `thememirror` | — | Temas para CodeMirror |
| `@uwdata/mosaic-sql` | ~0.4.0 | Builder de queries SQL |
| `@tidyjs/tidy` | 2.5.2 | Manipulação de dados estilo tidyverse |
| `chroma-js` | ~2.4.2 | Manipulação de cores (gradientes de mapas/charts) |
| `tailwindcss` | 3.4.18 | Estilização |
| `vite` | 5.4.21 | Bundler |
| `pnpm` | 8.15.9 | Package manager |

---

## 10. Extensão VSCode — Features Completas

**Pacote:** `packages/extension`

| Feature | Implementação |
|---------|--------------|
| Slash Commands (`/`) | Snippets VSCode em `emd.code-snippets` |
| Hint "Press / for commands..." | `TextEditorDecorationType` + `onDidChangeTextEditorSelection` |
| SQL Autocomplete | `CompletionItemProvider` com DuckDB keywords + schema |
| Component Prop Autocomplete | `CompletionItemProvider` com `props_list.json` |
| Schema Viewer (sidebar) | `TreeDataProvider` → `SchemaViewProvider` |
| Syntax highlighting de blocos SQL | `TextEditorDecorationType` por regex |
| Copy/Insert column ou table name | Commands da Schema sidebar |
| Criar projeto a partir de template | `cloneTemplateRepository()` via tiged (git clone) |
| Dev server (start/stop/rebuild) | Terminal integrado |
| Telemetria | `TelemetryService` + Segment |
| Detecção de contexto (SQL vs componente) | `isInSQLCodeBlock()`, `isInComponentContext()` |

---

## 11. Fluxo Completo de um Relatório Interativo

```
Autor digita no VSCode:
┌──────────────────────────────────────────────────┐
│ # Vendas por Categoria                           │
│                                                  │
│ [cursor em linha vazia]                          │
│                           Press / for commands...│
│                                                  │
│ /DropdownWithFilteredQuery  ← digita o comando   │
└──────────────────────────────────────────────────┘
                  │
                  ▼ extensão insere snippet
┌──────────────────────────────────────────────────┐
│ <Dropdown data={data} name=selected_category     │
│           value=category/>                       │
│                                                  │
│ ```sql filtered_sales                            │
│ select date, sum(revenue) as revenue             │
│ from sales                                       │
│ where category = '${inputs.selected_category    │
│                          .value}'               │
│ group by date order by date                      │
│ ```                                              │
│                                                  │
│ [cursor no próximo placeholder]                  │
└──────────────────────────────────────────────────┘
                  │
                  ▼ bun dev (SvelteKit + preprocess)
┌──────────────────────────────────────────────────┐
│ BROWSER                                          │
│  DuckDB WASM carrega sales.parquet               │
│  Dropdown renderiza categorias únicas            │
│  Usuário seleciona "Eletrônicos"                 │
│       ↓                                          │
│  inputs.selected_category.value = 'Eletrônicos' │
│       ↓                                          │
│  Query re-executa com WHERE category =           │
│       'Eletrônicos'                              │
│       ↓                                          │
│  LineChart re-renderiza com dados filtrados      │
└──────────────────────────────────────────────────┘
```

---

## 12. O que Evidence NÃO tem (comparado a Copilot real)

| Capacidade | Evidence | Copilot/LLM real |
|-----------|---------|-----------------|
| Geração de SQL por linguagem natural | ❌ | ✅ |
| Sugestão de gráfico baseada nos dados | ❌ | ✅ |
| Chat / conversa | ❌ | ✅ |
| Criar dashboard a partir de descrição | ❌ | ✅ (alguns) |
| Corrigir erros SQL automaticamente | ❌ | ✅ |
| Slash commands baseados em regras | ✅ | — |
| Autocomplete de schema real | ✅ | ✅ |
| Interatividade bidirecional input→query | ✅ | — |
| SQL in-browser sem backend | ✅ | — |

O "Copilot" do Evidence é **determinístico, baseado em templates** — é muito mais próximo de um sistema de snippets inteligentes com consciência de contexto do que de uma IA generativa. O valor está na **integração profunda com o schema** real do projeto e na **reatividade automática** entre inputs e queries.

---

## 13. Pontos Interessantes

1. **Zero-backend SQL:** Toda a execução de queries no relatório final roda no browser via DuckDB WASM. O servidor só serve os `.parquet` estáticos. Isso elimina latência e custo de infra para relatórios.

2. **Modelo "code as truth":** Ao contrário de ferramentas drag-and-drop como Metabase/Grafana, Evidence mantém os relatórios como arquivos `.md` versionáveis em git — diff, code review e CI/CD nativos.

3. **Reatividade declarativa sem estado manual:** O binding `${inputs.nome.value}` nos templates SQL é processado pelo Svelte store reativo — não há `useState`, `useEffect` ou event handlers manuais. A query simplesmente re-executa quando o valor muda.

4. **Schema Explorer bidirecional:** O Schema Viewer na sidebar do VSCode lê o `manifest.json` gerado no build. Você clica em uma coluna → o nome é inserido no cursor. Isso fecha o loop editor → dados → editor.

5. **Faker datasource para demos:** `@evidence-dev/faker-datasource` gera dados sintéticos realistas (usuários, voos etc.) definidos por arquivos YAML de schema. Permite criar demos funcionais sem dados reais.

6. **Dimension Grid:** O componente `<DimensionGrid>` é particularmente inteligente — recebe um dataset e automaticamente cria uma grid de mini-charts, um por dimensão categórica detectada. É o único componente com algo próximo de "IA" no sentido de inferência automática da estrutura dos dados.

7. **Snippets com tab stops aninhados:** Os snippets dos slash commands usam a sintaxe VSCode de `${1:placeholder}` — o cursor pula entre os campos obrigatórios na ordem certa (nome da query → coluna X → coluna Y), reduzindo o atrito de escrita.

8. **Highlight contextual de código:** A extensão aplica backgrounds diferentes para blocos SQL (cinza), frontmatter (azul), `{#each}` (roxo) e `{#if}` (laranja) — sem nenhuma extensão adicional, o arquivo `.md` tem coloração semântica rich que ajuda a distinguir as camadas de código.
