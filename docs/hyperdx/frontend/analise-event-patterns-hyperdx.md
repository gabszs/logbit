# Análise da visualização `Event Patterns` no HyperDX

## Objetivo

Na tela de search de logs do HyperDX existe um modo de análise chamado `Event Patterns`. Em vez de mostrar a tabela tradicional de eventos individuais, esse modo reorganiza os resultados em grupos de padrões de mensagem.

Na prática, a UI troca de:

- lista de eventos crus

para:

- lista de padrões agregados de evento

Cada linha passa a representar um template de mensagem, com:

- trend temporal
- contagem estimada
- nível representativo
- texto do padrão

Esse modo serve para ajudar a encontrar rapidamente tipos de eventos recorrentes, em vez de navegar linha por linha.

## Arquivos principais

### Entrada e troca de modo

- Página principal de search: [otel/hyperdx/packages/app/src/DBSearchPage.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/DBSearchPage.tsx:807)
- Sidebar com tabs de modo de análise: [otel/hyperdx/packages/app/src/components/DBSearchPageFilters.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBSearchPageFilters.tsx:1351)

### Visualização de patterns

- Tabela principal de patterns: [otel/hyperdx/packages/app/src/components/PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:1)
- Side panel de um pattern selecionado: [otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx:1)
- Hook de agrupamento/mineração: [otel/hyperdx/packages/app/src/hooks/usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:1)

### Infraestrutura reutilizada

- Tabela base que também renderiza patterns: [otel/hyperdx/packages/app/src/components/DBRowTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBRowTable.tsx:563)
- Contagem total dos resultados: [otel/hyperdx/packages/app/src/components/SearchTotalCountChart.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/SearchTotalCountChart.tsx:24)

## Onde o modo `Event Patterns` nasce no frontend

O estado da visualização é controlado por query string usando o parâmetro `mode`.

Em `DBSearchPage.tsx`, o estado é:

- `results`
- `delta`
- `pattern`

Trecho importante:

- `useQueryState('mode', parseAsStringEnum(...).withDefault('results'))`

Path:

- [DBSearchPage.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/DBSearchPage.tsx:833)

Isso significa que a visualização de patterns:

- faz parte do estado navegável da página
- pode ser compartilhada por URL
- não é um estado local escondido em um componente

## Onde o usuário troca para `Event Patterns`

Na sidebar de filtros, há uma seção `Analysis Mode` com tabs verticais:

- `Results Table`
- `Event Deltas`
- `Event Patterns`

Path:

- [DBSearchPageFilters.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBSearchPageFilters.tsx:1351)

Quando o usuário clica em `Event Patterns`, o código chama:

```ts
setAnalysisMode(value as 'results' | 'delta' | 'pattern')
```

Isso muda o `mode` da URL e dispara a troca da área principal da página.

## Efeito colateral importante: live mode é desligado

Em `DBSearchPage.tsx`, existe um `useEffect` que desliga live mode quando `analysisMode` vira `pattern` ou `delta`.

Path:

- [DBSearchPage.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/DBSearchPage.tsx:847)

Regra:

```ts
if (analysisMode === 'delta' || analysisMode === 'pattern') {
  setIsLive(false);
}
```

Isso é importante porque a visualização por patterns depende de amostragem, mineração e agrupamento. Ela não foi desenhada como streaming contínuo da tabela de eventos.

## Como a tela troca de `Results Table` para `Event Patterns`

Dentro de `DBSearchPage.tsx`, a renderização principal é condicional por `analysisMode`.

Quando `analysisMode === 'pattern'`, a página monta esta estrutura:

1. cabeçalho com contagem e controles
2. gráfico temporal (`DBTimeChart`)
3. tabela de patterns (`PatternTable`)

Path:

- [DBSearchPage.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/DBSearchPage.tsx:1887)

Ou seja, a view de patterns não é uma página separada. É uma ramificação da mesma search page.

## Estrutura visual da tela `Event Patterns`

Quando o modo `pattern` está ativo, a tela principal tem:

- a mesma sidebar de filtros
- a mesma barra superior de busca
- o mesmo time range
- o mesmo gráfico temporal de distribuição
- uma tabela diferente na área de resultados

Essa tabela diferente é o `PatternTable`.

## O papel do `PatternTable`

`PatternTable.tsx` é o componente que monta a visualização agregada de patterns.

Path:

- [PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:19)

Ele faz três coisas principais:

1. calcula o `totalCount` da busca
2. chama `useGroupedPatterns(...)`
3. transforma o resultado agrupado em uma tabela ordenada por volume

## Como o `PatternTable` calcula a contagem total

Antes de minerar os padrões, o componente chama:

```ts
useSearchTotalCount(totalCountConfig, totalCountQueryKeyPrefix)
```

Path:

- [PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:33)
- [SearchTotalCountChart.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/SearchTotalCountChart.tsx:24)

Essa contagem é usada para estimar melhor o volume de cada pattern.

Detalhe importante:

- os patterns são minerados em uma amostra
- mas a contagem final tenta refletir melhor o universo total via multiplicador

## Como a mineração de patterns funciona

### 1. O componente chama `useGroupedPatterns`

O `PatternTable` passa para o hook:

- `config`
- `samples: 10_000`
- `bodyValueExpression`
- `severityTextExpression` para logs
- `statusCodeExpression` para traces
- `totalCount`

Path:

- [PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:43)

O número `10_000` é o tamanho da amostra usada para detectar padrões.

## 2. O hook `usePatterns` gera uma consulta derivada

Em vez de usar a query bruta do usuário como está, o hook monta uma configuração específica para mineração.

Ele troca o `select` por colunas mínimas:

- body do evento como `__hdx_pattern_field`
- timestamp como `__hdx_timestamp`
- severity se existir
- status code se existir

Além disso, usa:

- `ORDER BY rand()`
- `LIMIT samples`

Path:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:139)

Isso significa que a mineração:

- usa amostragem aleatória
- não roda sobre todas as linhas
- favorece custo e responsividade no frontend

## 3. O frontend carrega Pyodide e `drain3`

O algoritmo de pattern mining roda no browser.

O hook carrega:

- `Pyodide`
- `micropip`
- `jsonpickle`
- `drain3`

Path:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:10)

Depois, ele cria um `TemplateMiner` em Python:

```python
from drain3 import TemplateMiner
from drain3.template_miner_config import TemplateMinerConfig
```

Esse miner detecta templates estruturais em mensagens de log.

## 4. Cada log vira um cluster/template

Para cada mensagem da amostra, o código executa:

```python
TemplateMiner.add_log_message(log)
```

O resultado inclui:

- `cluster_id`
- `template_mined`

O hook reanexa isso nas linhas:

- `__hdx_patternId`
- `__hdx_pattern`

Path:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:182)

## 5. Os resultados são agrupados por `patternId`

Em `useGroupedPatterns`, o agrupamento é feito por:

```ts
const key = `${row.__hdx_patternId}`;
```

Path:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:261)

Para cada grupo, o hook monta:

- `id`
- `pattern`
- `count`
- `countStr`
- `severityText`
- `statusCode`
- `samples`
- `__hdx_pattern_trend`

## Como a contagem de cada pattern é estimada

O hook calcula:

- `sampledRowCount = results?.data.length`
- `sampleMultiplier = totalCount / sampledRowCount`

Se existir `totalCount`, o volume do pattern é escalado para uma estimativa do total:

```ts
const count = Math.max(Math.round(rows.length * sampleMultiplier), 1);
```

Path:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:248)
- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:291)

Isso explica por que a UI mostra `~count` e não uma contagem absoluta garantida.

## Como o trend temporal de cada pattern é gerado

Cada grupo ganha uma série temporal em `__hdx_pattern_trend`.

O hook:

1. define uma granularidade pela faixa de tempo
2. cria buckets de tempo
3. conta quantas amostras do pattern caem em cada bucket
4. escala esses valores pelo multiplicador da amostra

Path:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:253)
- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:302)

## Como a tabela de patterns é renderizada

Depois do agrupamento, o `PatternTable` faz:

```ts
Object.values(groupedResults).sort((a, b) => b.count - a.count)
```

Path:

- [PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:56)

Ou seja, a lista mostra primeiro os padrões mais frequentes.

## A visualização usa a mesma `RawLogTable`

Em vez de criar uma tabela nova do zero, o HyperDX reutiliza a infraestrutura da tabela base.

O `PatternTable` chama:

```tsx
<RawLogTable ... />
```

com estas colunas:

- `__hdx_pattern_trend`
- `countStr`
- `severityText`
- `pattern`

Path:

- [PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:90)

Isso é importante para manutenção: a UI de patterns parece especializada, mas herda muito do comportamento da tabela genérica.

## Como a coluna `Trend` funciona

Na tabela base, existe um caso especial:

```ts
if (column === '__hdx_pattern_trend') {
  return <PatternTrendChart ... />
}
```

Path:

- [DBRowTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBRowTable.tsx:591)

Isso significa que a coluna `Trend` é uma célula customizada renderizada dentro da infraestrutura padrão da tabela.

## Como a cor do trend é escolhida

A cor do mini-gráfico vem de:

- `severityText`, quando existir
- `statusCode`, como fallback

Isso faz a visualização herdar um sentido visual de severidade.

Path:

- [DBRowTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBRowTable.tsx:597)

## O que acontece ao clicar em um pattern

Cada linha da tabela de patterns é clicável.

Ao clicar, o `PatternTable` salva o pattern selecionado em estado local:

```ts
onRowDetailsClick={row => setSelectedPattern(row as Pattern)}
```

Path:

- [PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:97)

Quando `selectedPattern` existe, a UI abre o `PatternSidePanel`.

## O que o `PatternSidePanel` mostra

O side panel mostra:

1. o texto do pattern
2. um botão de resumo AI
3. uma tabela com amostras do pattern
4. acesso a detalhes do evento individual

Path:

- [PatternSidePanel.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx:23)

## Como as amostras do pattern são mostradas

O pattern guarda `samples`, que são linhas representativas daquele cluster.

O side panel mostra inicialmente:

- até `100` amostras

e depois libera `Show all ... samples`.

Path:

- [PatternSidePanel.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx:84)

As colunas mostradas são:

- timestamp
- service
- level
- body

## Como abrir um evento individual a partir do pattern

Ao clicar em uma amostra no side panel, o código reconstrói um `rowWhere` usando:

- body
- timestamp

Isso é feito por `useRowWhere`.

Path:

- [PatternSidePanel.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx:64)

Depois disso, ele abre o `DBRowSidePanel`, que é o painel tradicional de detalhes de um evento individual.

Path:

- [PatternSidePanel.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx:145)

Isso é um detalhe importante de UX:

- a tabela principal mudou de eventos para patterns
- mas ainda existe drill-down para o evento real

## Exemplo conceitual de como os patterns aparecem

Suponha que a busca encontre logs assim:

- `User 123 failed login from 10.0.0.1`
- `User 456 failed login from 10.0.0.2`
- `User 999 failed login from 10.0.0.9`
- `Redis connection timeout after 2000ms`
- `Redis connection timeout after 1800ms`

O miner pode transformar isso em algo próximo de:

- `User <*> failed login from <*>`
- `Redis connection timeout after <*>ms`

Na tabela `Event Patterns`, o usuário veria algo como:

- Trend: mini-série temporal
- Count: `~3`
- Level: `warn`
- Pattern: `User <*> failed login from <*>`

e outra linha:

- Trend: mini-série temporal
- Count: `~2`
- Level: `error`
- Pattern: `Redis connection timeout after <*>ms`

## Diferença entre `Results Table`, `Denoise Results` e `Event Patterns`

### `Results Table`

- mostra eventos individuais
- usa a tabela normal

### `Denoise Results`

- continua no modo de eventos individuais
- apenas esconde visualmente linhas pertencentes a padrões muito frequentes

### `Event Patterns`

- abandona a visão de evento individual como lista principal
- substitui a tabela por agregados de pattern
- cada linha vira um grupo/template

Essa distinção é importante porque os dois recursos usam mineração de patterns, mas a UX é diferente:

- `denoise` filtra
- `patterns` agrega

## Limitações e implicações

### É uma visão amostral e heurística

Como os patterns vêm de:

- `ORDER BY rand()`
- `LIMIT 10_000`
- clustering heurístico com `drain3`

o resultado não é uma agregação exata do dataset completo.

### A contagem é estimada

O `countStr` usa `~` porque o volume é extrapolado da amostra.

### A representatividade do severity é aproximada

O código usa o último registro do grupo como `severityText` representativo:

```ts
severityText: lastRow?.[SEVERITY_TEXT_COLUMN_ALIAS]
```

Path:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:299)

Ou seja, o nível exibido não é necessariamente a distribuição real de severidades do cluster.

### O pattern depende da expressão de body do source

O agrupamento é guiado por `bodyValueExpression`, então se o source mudar a forma de expor o corpo do evento, a qualidade dos clusters também muda.

No `DBSearchPage`, esse valor vem de:

- `getEventBody(searchedSource)`

Path:

- [DBSearchPage.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/DBSearchPage.tsx:1937)

## Onde mexer, dependendo do tipo de alteração

### Trocar a UX da aba `Event Patterns`

Edite:

- [DBSearchPageFilters.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBSearchPageFilters.tsx:1368)
- [DBSearchPage.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/DBSearchPage.tsx:1887)

### Trocar a composição das colunas da tabela de patterns

Edite:

- [PatternTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternTable.tsx:90)

### Trocar a lógica de mineração/agrupamento

Edite:

- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:139)
- [usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:217)

### Trocar a renderização da célula de trend

Edite:

- [DBRowTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBRowTable.tsx:591)

### Trocar o detalhe de um pattern selecionado

Edite:

- [PatternSidePanel.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx:23)

### Trocar a forma de abrir evento individual a partir do pattern

Edite:

- [PatternSidePanel.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/PatternSidePanel.tsx:64)

## Fluxo completo resumido

O fluxo inteiro da aba `Event Patterns` é:

1. usuário troca `Analysis Mode` para `pattern`
2. a URL recebe `mode=pattern`
3. live mode é desligado
4. a página mantém filtros e time range atuais
5. o `PatternTable` calcula `totalCount`
6. o hook `usePatterns` faz uma consulta amostral aleatória
7. o frontend minera templates com `drain3` via Pyodide
8. o hook agrupa os eventos por `cluster_id`
9. o resultado é enriquecido com count estimado, trend e samples
10. a tabela mostra patterns ordenados por volume
11. ao clicar em um pattern, abre um side panel com amostras
12. ao clicar em uma amostra, abre o painel tradicional do evento

## Conclusão

`Event Patterns` no HyperDX é uma visualização derivada da mesma busca de logs, mas com semântica diferente da tabela tradicional. Em vez de renderizar eventos crus, ela faz amostragem, clusterização de mensagens e agrupamento por template, gerando uma tabela de padrões com tendência temporal e drill-down para exemplos reais.

Em resumo:

- a troca de modo acontece na própria search page
- o frontend usa `mode=pattern`
- o algoritmo roda no browser com `Pyodide + drain3`
- a mineração é amostral
- os counts são estimados
- a tabela de patterns reutiliza a infraestrutura da tabela base
- o side panel fecha o ciclo entre agregado e evento individual
