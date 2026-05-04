# Análise do `Denoise Results` no HyperDX

## Objetivo

O `Denoise Results` é uma opção da tela de busca de logs do HyperDX que remove visualmente da tabela eventos considerados repetitivos ou "ruidosos". A intenção não é alterar a consulta principal, mas reduzir o volume de linhas muito parecidas para facilitar a leitura dos resultados.

O comportamento observado é:

- o filtro existe apenas no modo `results`
- ele não altera o `WHERE`, `SELECT` ou `ORDER BY` da busca principal
- ele não remove dados no backend
- ele atua no frontend, depois que os resultados já foram buscados
- ele detecta padrões repetidos de mensagem e oculta da tabela os eventos que pertençam a padrões muito frequentes

## Arquivos principais

- Tela principal de search: [otel/hyperdx/packages/app/src/DBSearchPage.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/DBSearchPage.tsx:856)
- Sidebar de filtros: [otel/hyperdx/packages/app/src/components/DBSearchPageFilters.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBSearchPageFilters.tsx:1421)
- Tabela que aplica o denoise: [otel/hyperdx/packages/app/src/components/DBRowTable.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/components/DBRowTable.tsx:1676)
- Lógica de mineração de padrões: [otel/hyperdx/packages/app/src/hooks/usePatterns.tsx](/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app/src/hooks/usePatterns.tsx:217)

## Fluxo geral

O fluxo do recurso é simples:

1. O usuário marca o checkbox `Denoise Results` na sidebar de filtros.
2. A página salva esse estado na URL usando o parâmetro `denoise`.
3. Ao ativar o denoise, o modo live é desligado.
4. A flag `denoiseResults` é repassada até a tabela de resultados.
5. A tabela busca uma amostra de logs, agrupa mensagens por padrão textual e identifica quais padrões são frequentes demais.
6. As linhas que pertencem a esses padrões frequentes deixam de ser exibidas.
7. A UI mostra uma lista dos padrões removidos em `Removed Noisy Event Patterns`.

## Onde o estado nasce

Na página principal de search, o estado do denoise é controlado por query string:

- `denoise=false` por padrão
- quando ativado, o código chama `setIsLive(false)` antes de salvar o novo valor

Trecho relevante:

- `useQueryState('denoise', parseAsBoolean.withDefault(false))`
- `setDenoiseResults(value)` desliga live mode e atualiza a URL

Isso mostra que o recurso é parte do estado navegável da página, e não apenas um estado local de renderização.

## Onde o toggle aparece

Na sidebar de filtros, o checkbox só é renderizado quando `analysisMode === 'results'`.

O tooltip do próprio componente já descreve o comportamento esperado:

- "visually remove events matching common event patterns from the results table"

Essa frase é importante porque confirma a intenção do design:

- remoção visual
- baseada em padrões comuns
- aplicada especificamente na tabela de resultados

## Como o denoise chega à tabela

O `DBSearchPage` passa `denoiseResults` para `DBSqlRowTableWithSideBar`, que por sua vez repassa a prop para `DBSqlRowTable` em `DBRowTable.tsx`.

Ou seja, a lógica real do denoise não acontece na sidebar nem na página de search. Ela acontece dentro do componente que prepara e renderiza as linhas.

## Como a detecção de eventos repetidos funciona

### 1. A tabela ativa a mineração de padrões

Quando `denoiseResults` está ligado, a tabela chama `useGroupedPatterns(...)` com:

- a configuração atual da busca
- `samples: 10_000`
- a coluna de corpo da mensagem como base do padrão
- opcionalmente a expressão de severity para enriquecer os grupos

Esse ponto é importante porque a detecção não roda sobre todo o dataset. Ela roda sobre uma amostra.

## 2. O hook `usePatterns` monta uma consulta de amostragem

O hook `usePatterns` cria uma configuração derivada da busca original para coletar exemplos de logs. Ele troca o `select` por um conjunto mínimo de colunas:

- corpo da mensagem, com alias `__hdx_pattern_field`
- timestamp, com alias `__hdx_timestamp`
- severity, quando existir
- status code, quando existir

Além disso, ele usa:

- `ORDER BY rand()`
- `LIMIT samples`

Na prática, isso significa:

- a mineração usa uma amostra aleatória
- o agrupamento de padrões é aproximado, não exato sobre todos os eventos

## 3. O frontend carrega Pyodide e a biblioteca `drain3`

O algoritmo de detecção de padrões não roda no backend. O frontend carrega:

- `Pyodide`
- `micropip`
- `jsonpickle`
- `drain3`

Depois disso, o código instancia um `TemplateMiner` em Python dentro do browser.

Esse é o coração da funcionalidade. O HyperDX usa um minerador de templates para transformar mensagens parecidas em um mesmo padrão, abstraindo variações como IDs, números ou trechos dinâmicos.

## 4. Cada log é minerado em um cluster de padrão

O método `minePatterns(logs)` passa cada mensagem para:

```python
TemplateMiner.add_log_message(log)
```

O resultado inclui:

- `cluster_id`
- `template_mined`

Depois, o hook reanexa essas informações às linhas amostradas:

- `__hdx_patternId`
- `__hdx_pattern`

Então o agrupamento não é por texto literal. Ele é por cluster/template inferido.

## 5. Os resultados são agrupados por `patternId`

Em `useGroupedPatterns`, o código agrupa as linhas pela chave:

```ts
const key = `${row.__hdx_patternId}`;
```

Para cada grupo, ele monta uma estrutura com:

- `id`
- `pattern`
- `count`
- `samples`
- `severityText`
- `statusCode`
- série temporal do padrão

O `count` pode ser estimado com multiplicador quando existe `totalCount`, mas para o denoise da tabela o ponto mais importante é a proporção do grupo dentro da amostra.

## 6. Regra para classificar um padrão como noisy

Na `DBRowTable`, depois que os grupos foram formados, o HyperDX seleciona como ruidosos os padrões cuja participação na amostra é maior que `10%`.

Regra exata:

```ts
p.count / (groupedPatterns.sampledRowCount ?? 1) > 0.1
```

Isso significa:

- se um padrão representa mais de 10% das linhas amostradas, ele é considerado noisy
- esse limiar é fixo no código
- não há sinal de parametrização via UI

Esse é o critério central de detecção de "eventos repetidos".

## 7. As linhas atuais da tabela são reclassificadas

Depois de identificar os `noisyPatternIds`, o código usa o miner novamente para classificar as linhas já processadas da tabela:

```ts
const matchedLogs = await groupedPatterns.miner?.matchLogs(
  processedRows.map(row => row[patternColumn]),
);
```

Para cada linha renderizada:

- o miner retorna o `cluster_id` correspondente
- se o `cluster_id` estiver em `noisyPatternIds`, a linha é removida

Filtro final:

```ts
return processedRows.filter((row, i) => {
  const match = matchedLogs?.[i];
  return !noisyPatternIds.includes(`${match}`);
});
```

Essa é a lógica efetiva de ocultação.

## Resumo da lógica de detecção de noisy events

Em termos conceituais, a lógica é:

1. pegar uma amostra aleatória de logs da consulta atual
2. minerar templates/padrões de mensagem com `drain3`
3. agrupar logs por cluster de padrão
4. medir a frequência de cada padrão dentro da amostra
5. marcar como noisy os padrões com frequência maior que 10%
6. aplicar esse conjunto de padrões sobre as linhas da tabela
7. esconder as linhas que pertençam a esses clusters

## O que exatamente ele remove

Ele não remove "mensagens duplicadas" por igualdade exata de texto.

Ele remove mensagens que o miner entende como pertencentes ao mesmo template estrutural. Isso é mais forte do que um simples `distinct` textual, porque permite agrupar variações do mesmo formato de log.

Exemplo conceitual:

- `User 123 failed login from 10.0.0.1`
- `User 456 failed login from 10.0.0.2`

Essas mensagens podem cair no mesmo template, mesmo não sendo idênticas.

## Efeito visível na UI

Quando o denoise está ativo, a tabela mostra um bloco adicional:

- `Removed Noisy Event Patterns`

Ali aparecem os templates que foram classificados como ruidosos. Se nada for considerado ruidoso, a UI mostra:

- `No noisy patterns found`

Isso ajuda a explicar para o usuário por que algumas linhas desapareceram.

## Limitações e implicações

### É uma heurística

Como o processo depende de:

- amostragem
- mineração de templates
- limiar fixo de 10%

o resultado não é determinístico no sentido analítico estrito. Ele é uma heurística de UX para limpeza visual.

### Pode esconder eventos válidos

Se um evento operacionalmente importante aparecer com alta frequência, ele também pode ser classificado como noisy e sumir da tabela.

### Não reduz custo da query principal

O denoise acontece depois do fetch principal. Portanto:

- não reduz I/O da busca principal
- não reduz scan da query principal
- não muda agregações/facets da consulta

### Tem custo adicional no frontend

O recurso adiciona:

- carregamento de Pyodide
- instalação de wheels Python no browser
- mineração de padrões
- reclassificação das linhas da tabela

Ou seja, melhora a legibilidade, mas tem custo computacional local.

## Conclusão

O `Denoise Results` é um pós-processamento de resultados no frontend. Ele usa uma amostra de logs da consulta atual, detecta templates repetidos com `drain3` rodando via Pyodide no navegador, marca como "noisy" os padrões que ocupam mais de 10% da amostra, e oculta da tabela as linhas que pertençam a esses padrões.

Em resumo:

- não é um filtro de backend
- não altera a query base
- não faz deduplicação literal
- faz clustering por template de mensagem
- considera noisy o que domina a amostra
- remove essas ocorrências apenas da visualização da tabela
