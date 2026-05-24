# HyperDX — Search Sidebar & Filtros Dinâmicos

Análise do componente `DBSearchPageFilters` e do sistema de filtros da página de search, cobrindo como os filtros são populados dinamicamente, sub-filtros, e variações por tipo de source (log vs trace).

---

## Localização dos arquivos principais

| Responsabilidade | Arquivo |
|---|---|
| Página `/search` | `pages/search/index.tsx` |
| Render do sidebar | `src/DBSearchPage.tsx` (linha ~1865) |
| Componente do sidebar | `src/components/DBSearchPageFilters.tsx` |
| Estado dos filtros | `src/searchFilters.tsx` |
| Sub-grupos aninhados | `src/components/NestedFilterGroup.tsx` |
| CSS do painel | `styles/SearchPage.module.scss` |

---

## Estrutura geral do sidebar

O `DBSearchPageFilters` mistura duas responsabilidades:

1. **Analysis Mode selector** — troca a área principal entre Results Table, Event Deltas e Event Patterns
2. **Facets/filtros dinâmicos** — painel com campos e valores filtráveis por accordion

O painel é redimensionável via `useResizable(16, "left")`, com largura persistida em `%`.

---

## Como os filtros são populados dinamicamente

O fluxo de população é sempre reativo ao estado atual da query:

```
source selecionado (log ou trace)
  └─ useAllFields(chartConfig)
       └─ metadata da tabela no ClickHouse
            └─ colunas normais + subcampos Map/JSON
                 └─ keysToFetch (subset priorizado)
                      └─ useGetKeyValues(key, chartConfig)
                           └─ groupUniqArray(limit) por campo
                                └─ valores distintos renderizados no accordion
```

### Critério de priorização em `keysToFetch`

Nem todos os campos aparecem de cara. O componente filtra e prioriza:

- Apenas campos do tipo string
- Campos `LowCardinality` primeiro (cardinalidade controlável)
- Subcampos de `Map` e `JSON` (ex: `LogAttributes.*`, `ResourceAttributes.*`)
- Campos que já têm valor selecionado no filtro atual
- Campos pinados pelo usuário (persistidos em `localStorage` por source)

### Reatividade ao estado atual

O `chartConfig` passado para `useGetKeyValues` inclui `where`, `filters` e `dateRange` do estado atual da query. Isso significa que os valores disponíveis dentro de cada filtro são recalculados contra o conjunto atual de resultados — se você filtrar por `SeverityText=error`, os valores de `ServiceName` passam a refletir só os serviços que têm erros.

---

## Sub-filtros: filtro → grupo → valores

Campos com prefixo compartilhado são agrupados por `groupFacetsByBaseName()`:

**Entrada:**
```
LogAttributes.level
LogAttributes.request_id
ResourceAttributes.service.name
ResourceAttributes.host.name
SpanAttributes.http.method
```

**Saída renderizada:**
```
LogAttributes
  level        → info | error | warn
  request_id   → abc  | def
ResourceAttributes
  service.name → api  | worker
  host.name    → host-1 | host-2
SpanAttributes
  http.method  → GET | POST
```

Cada grupo é um accordion (`FilterGroup`). O corpo (`FilterGroupBody`) só monta quando o accordion expande, evitando hooks caros em filtros colapsados.

Grupos com muitos subcampos usam virtualização via `NestedFilterGroup.tsx` (linha ~84).

---

## Ações por campo

Cada campo no sidebar oferece ações contextuais:

- **Mostrar distribuição** — abre chart de distribuição do campo
- **Adicionar/remover coluna** — inclui ou exclui da tabela de resultados
- **Pin field** — mantém o campo visível mesmo que não tenha valores no resultado atual (persistido em `localStorage`)
- **Limpar filtros** — remove todos os valores selecionados para aquele campo

---

## Estado dos filtros: `useSearchPageFilterState`

Localização: `src/searchFilters.tsx` linha ~400.

Mantém três estados por campo:

| Estado | Significado | SQL gerado |
|---|---|---|
| `included` | valores selecionados para incluir | `field IN (val1, val2)` |
| `excluded` | valores selecionados para excluir | `field NOT IN (val1, val2)` |
| `range` | intervalo numérico | `field BETWEEN a AND b` |

Quando o sidebar muda qualquer filtro, chama `setValue("filters", filters)` no form do `DBSearchPage`, que dispara um submit com debounce de 1s (linha ~1051 em `DBSearchPage.tsx`).

---

## Variações por tipo de source

O sidebar não tem uma lista fixa por tipo. Ele usa `source.kind` apenas para habilitar/desabilitar capacidades específicas.

### Source Log (`SourceKind.Log`)

- Filtros dinâmicos normais (campos + subcampos de Map/JSON)
- Event Patterns disponível (exceto no build ClickHouse: `!IS_CLICKHOUSE_BUILD`)
- **Sem** Event Deltas
- **Sem** Root Spans Only

### Source Trace (`SourceKind.Trace`)

**Root Spans Only** — aparece quando:
```ts
source?.kind === SourceKind.Trace && source.parentSpanIdExpression
```
Quando ativado, adiciona filtro em `ParentSpanId = ""` ou `isRootSpan = true` (se essa coluna existir).

**Event Deltas** — aparece quando:
```ts
searchedSource?.kind === SourceKind.Trace && searchedSource.durationExpression
```
Usa `durationExpression` do source para construir análise de latência.

**Event Patterns** — disponível para ambos os tipos, mas só se `!IS_CLICKHOUSE_BUILD`.

---

## Analysis Mode

Localização: `DBSearchPageFilters.tsx` linha ~1351.

Tabs verticais:

| Tab | Condição | Área principal renderizada |
|---|---|---|
| Results Table | sempre | tabela de logs/spans |
| Event Deltas | `showDelta = true` (só trace com `durationExpression`) | heatmap/deltas de latência |
| Event Patterns | `!IS_CLICKHOUSE_BUILD` | `PatternTable` |

Ao trocar para `delta` ou `pattern`, o live mode é desligado automaticamente — essas análises precisam de uma janela de tempo fechada.

---

## Pins e persistência local

Campos pinados são salvos em `localStorage` com chave por `sourceId`. Quando o sidebar monta, ele mescla os pins de volta nas facets — campos pinados continuam visíveis mesmo que não retornem valores na query atual. Isso é útil para campos que têm baixa frequência mas são importantes para o usuário.

---

## Pontos de acoplamento relevantes para replicar

Se for replicar esse padrão no `apps/web`, os pontos de maior atenção são:

1. **`useAllFields`** depende de metadata real do ClickHouse via proxy — precisa da conexão e do source configurado
2. **`useGetKeyValues`** faz uma query por campo visível — pode disparar muitas requisições em paralelo; considerar batching ou limite de campos simultâneos
3. **O `chartConfig` passado para buscar valores inclui filtros ativos** — isso é o que torna os valores reativos; sem isso os valores seriam estáticos
4. **Pins em `localStorage`** são simples mas funcionam — chave `pins_{sourceId}`, valor é array de field names
5. **`FilterGroupBody` lazy** — só monta hooks quando accordion abre; replicar esse padrão para não explodir em queries quando há muitos grupos

---

## Sugestão de separação para replicar no apps/web

```
SearchSidebarShell          ← painel redimensionável + scroll
  AnalysisModeSelector      ← tabs Results / Deltas / Patterns
  FacetsFilterPanel         ← lista de grupos de filtros
    FilterGroup             ← accordion por base name (lazy body)
      FilterGroupBody       ← valores com include/exclude
        NestedFilterGroup   ← virtualizado para subcampos grandes

hooks/
  useSearchFacetFields      ← wrapper de useAllFields + priorização
  useSearchFacetValues      ← wrapper de useGetKeyValues por campo
  useFilterState            ← included/excluded/range + serialização SQL
```
