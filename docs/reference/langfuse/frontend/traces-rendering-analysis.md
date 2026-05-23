# Langfuse Frontend: analise de renderizacao de traces

## Escopo analisado

Esta analise cobre principalmente `otel/langfuse/web/src` com foco em:

- a pagina `/project/[projectId]/traces`
- a pagina de detalhe `/project/[projectId]/traces/[traceId]`
- a forma como o frontend monta a arvore encadeada de spans/observations
- a timeline
- o graph view
- a logica de ordenacao dos traces, observations e spans

O ponto importante aqui e que a URL que voce citou, `/project/<id>/traces`, renderiza a lista de traces. O encadeamento ponta a ponta mesmo aparece na pagina de detalhe de um trace especifico, em `/project/<id>/traces/[traceId]`.

---

## 1. O que renderiza `/project/[projectId]/traces`

Arquivo principal:

- `otel/langfuse/web/src/pages/project/[projectId]/traces.tsx`

Fluxo:

1. A pagina decide se mostra onboarding ou a tabela/lista de traces.
2. Ela consulta a feature flag `useV4Beta()`.
3. Se `isBetaEnabled === false`, renderiza a tabela legacy de traces:
   - `TracesTable`
4. Se `isBetaEnabled === true`, renderiza a tabela nova baseada em events:
   - `ObservationsEventsTable`

Referencias:

- escolha entre tabela legacy e v4: `pages/project/[projectId]/traces.tsx:15-105`

### Ordenacao da lista de traces

Na tabela legacy, a ordenacao default e por timestamp decrescente:

- `components/table/use-cases/traces.tsx:227-230`

Ou seja:

- traces mais recentes primeiro
- `column: "timestamp"`
- `order: "DESC"`

Entao a pagina `/traces` nao “plota” o encadeamento interno. Ela lista traces. O encadeamento e montado quando se entra no detalhe do trace.

---

## 2. Entrada da pagina de detalhe do trace

Arquivos principais:

- `pages/project/[projectId]/traces/[traceId].tsx`
- `components/trace2/TracePage.tsx`
- `components/trace2/Trace.tsx`

Fluxo:

1. A rota extrai `traceId` e `timestamp`.
2. `TracePage` decide de onde viram os dados:
   - v3/legacy: `api.traces.byIdWithObservationsAndScores`
   - v4/events: `useEventsTraceData`
3. Quando os dados chegam, `TracePage` renderiza `<Trace ... />`.

Referencias:

- rota: `pages/project/[projectId]/traces/[traceId].tsx:1-13`
- decisao v3/v4 e montagem da tela: `components/trace2/TracePage.tsx:21-237`

### Fontes de dados

#### Legacy / traces table

`TracePage` chama:

- `api.traces.byIdWithObservationsAndScores`

Esse endpoint:

- busca o trace
- busca todas as observations do trace sem IO pesado
- busca scores/corrections
- calcula `latency`
- devolve `trace + observations + scores + corrections`

Referencia:

- `server/api/routers/traces.ts:352-428`

#### V4 / events table

`TracePage` usa:

- `useEventsTraceData`

Esse hook faz:

1. `api.events.byTraceId` para pegar todas as observations do trace
2. encontra a root observation (`!parentObservationId`)
3. faz `api.events.batchIO` so para a root, para obter IO de nivel de trace
4. busca scores do trace
5. adapta tudo para o formato esperado pelo componente `Trace`

Referencias:

- hook: `features/events/hooks/useEventsTraceData.ts:40-170`
- adaptador: `features/events/lib/eventsToTraceAdapter.ts:21-108`

### Diferenca estrutural entre v3 e v4

No v3 existe um trace “real” e as observations ficam abaixo dele.

No v4 a UI sintetiza um trace a partir das observations:

- o `earliest.startTime` vira `trace.timestamp`
- a root observation contribui com `name`, `bookmarked`, `public`
- o frontend marca `rootObservationType` e `rootObservationId`

Referencia:

- `features/events/lib/eventsToTraceAdapter.ts:38-94`

Impacto pratico:

- v3: a arvore costuma ter um nó wrapper `TRACE`
- v4: em muitos casos a raiz visual passa a ser a root observation

---

## 3. Como a UI do detalhe e composta

Arquivo principal:

- `components/trace2/Trace.tsx`

O componente `Trace` monta uma pilha de providers:

- `ViewPreferencesProvider`
- `TraceDataProvider`
- `TraceGraphDataProvider`
- `SelectionProvider`
- `SearchProvider`
- `JsonExpansionProvider`

Depois ele escolhe layout mobile ou desktop e injeta:

- painel esquerdo: navegacao
- painel direito: detalhe
- graph view opcional

Referencia:

- `components/trace2/Trace.tsx:37-168`

### O painel esquerdo pode mostrar 3 coisas

Arquivo:

- `components/trace2/components/_layout/TracePanelNavigation.tsx`

Prioridade:

1. se ha busca, mostra `TraceSearchList`
2. senao, se `view=timeline`, mostra `TraceTimeline`
3. senao, mostra `TraceTree`

Ou seja, a mesma estrutura de dados pode ser navegada em:

- arvore
- timeline
- busca

### O painel direito decide entre trace e observation

Arquivo:

- `components/trace2/components/_layout/TracePanelDetail.tsx`

Regra:

- se existe `selectedNodeId` e ele nao e `TRACE`, abre `ObservationDetailView`
- caso contrario, abre `TraceDetailView`

Entao clicar num span/observation na arvore, timeline ou graph muda o painel direito.

Referencia:

- `TracePanelDetail.tsx:1-71`

---

## 4. Onde nasce a arvore encadeada de spans/observations

Arquivo central:

- `components/trace2/lib/tree-building.ts`

Esse e o coracao da logica.

### Resumo do algoritmo

O comentario do proprio arquivo ja resume bem:

1. ordenar observations por `startTime`
2. construir grafo parent-child em memoria
3. calcular profundidade com BFS top-down
4. processar bottom-up para montar `TreeNode`
5. gerar uma lista flatten para busca/renderizacao virtualizada

Referencia:

- `tree-building.ts:1-20`

### Etapa 1: limpeza e ordenacao inicial

Funcao:

- `prepareObservations`

Ela faz duas coisas importantes:

1. se `parentObservationId` aponta para um pai inexistente, esse parent e removido e a observation vira root
2. todas as observations sao ordenadas por `startTime ASC`

Referencia:

- `tree-building.ts:75-102`

Isso significa:

- a ordem base visual e cronologica
- orfaos nao quebram a UI; eles sobem para a raiz

### Etapa 2: montar relacoes pai-filho

Funcao:

- `buildDependencyGraph`

Ela:

- cria um `Map` com todos os nos
- preenche `childrenIds` do pai
- identifica roots (`!parentObservationId`)
- calcula `depth` com BFS
- marca folhas (`leafIds`)

Referencias:

- `tree-building.ts:104-175`

Um detalhe importante:

- como os filhos sao adicionados depois que a lista ja foi ordenada por `startTime`, a ordem dos filhos no pai preserva a ordem cronologica

Isso esta documentado no comentario:

- `tree-building.ts:160-163`

### Etapa 3: construir `TreeNode` bottom-up

Funcao:

- `buildTreeNodesBottomUp`

Ela processa folhas primeiro e pais depois. Isso serve para:

- agregar custo dos filhos antes do pai
- calcular `childrenDepth`
- preencher metadados temporais

Metadados calculados por no:

- `startTimeSinceTrace`
- `startTimeSinceParentStart`
- `depth`
- `childrenDepth`
- `totalCost` agregado

Referencias:

- `tree-building.ts:177-287`

### Etapa 4: definir roots finais

Funcao:

- `buildTraceTree`

Depois da montagem:

- os roots sao ordenados por `startTime ASC`
- no v4/events eles podem ser retornados diretamente
- no v3 eles sao embrulhados por um no `TRACE`

Referencias:

- roots ordenados: `tree-building.ts:304-313`
- comportamento v4 sem wrapper: `tree-building.ts:314-328`
- wrapper `TRACE` no legacy: `tree-building.ts:330-360`

### Etapa 5: flatten para busca e renderizacao

Funcao:

- `buildTraceUiData`

Ela gera `searchItems` com percurso depth-first iterativo.

Detalhe importante:

- os roots entram na stack em ordem reversa
- isso garante DFS “left-to-right” preservando a ordem visual original

Referencia:

- `tree-building.ts:362-430`

---

## 5. Regra exata de ordenacao dos spans/observations

Se eu resumir a logica de ordem em uma frase:

> a UI primeiro respeita a hierarquia `parentObservationId`, e dentro de cada nivel respeita a ordem cronologica por `startTime`.

Mais explicitamente:

1. A lista inteira de observations e ordenada por `startTime ASC`.
2. A relacao pai-filho e montada usando `parentObservationId`.
3. Os filhos de um mesmo pai ficam na ordem em que foram vistos na lista ja ordenada.
4. Os roots tambem sao ordenados por `startTime ASC`.
5. A renderizacao flatten usa DFS pre-order para manter o encadeamento visual.

Consequencia visual:

- primeiro voce ve o root mais cedo
- depois seus filhos, em ordem cronologica
- depois os descendentes desses filhos
- depois o proximo root

### Casos especiais

#### Orfaos

Se o pai nao existe na carga atual:

- `parentObservationId` e limpo
- o span vira root

Referencia:

- `tree-building.ts:88-93`

#### Filtro por nivel

O filtro por `DEBUG/DEFAULT/WARNING/ERROR` nao reconstrui a arvore.

Ele e aplicado depois, em `TraceDataProvider`, via `removeHiddenNodes`, promovendo os filhos do no oculto para o nivel acima.

Referencias:

- provider: `TraceDataContext.tsx:90-116`
- funcao: `tree-building.ts:432-478`

Isso e importante porque:

- a ordem estrutural continua consistente
- esconder um no nao “mata” necessariamente o ramo inteiro

---

## 6. Como a arvore e renderizada na pratica

Arquivo:

- `components/trace2/components/TraceTree.tsx`

O `TraceTree`:

- consome `roots` do `TraceDataContext`
- consome `selectedNodeId` e `collapsedNodes`
- usa `VirtualizedTree`
- renderiza cada item com `VirtualizedTreeNodeWrapper`
- o conteudo visual do span fica em `SpanContent`

Referencia:

- `TraceTree.tsx:1-66`

### O que isso revela

- a arvore e virtualizada
- a UI nao renderiza todos os nos de uma vez no DOM
- a estrutura hierarquica e separada do conteudo visual do span

Entao o encadeamento nao depende do DOM bruto; ele depende da estrutura `roots/nodeMap/searchItems` criada antes.

---

## 7. Como a timeline e montada

Arquivos:

- `components/trace2/components/TraceTimeline/index.tsx`
- `components/trace2/components/TraceTimeline/timeline-flattening.ts`

### Pipeline

1. `TraceTimeline` pega `roots`
2. calcula `traceDuration`
3. calcula `traceStartTime`
4. chama `flattenTreeWithTimelineMetrics(...)`
5. usa `@tanstack/react-virtual` para renderizar linhas virtualizadas

Referencias:

- timeline principal: `TraceTimeline/index.tsx:1-207`
- flattening: `timeline-flattening.ts:14-139`

### Logica de ordem na timeline

Ela continua baseada na mesma arvore, mas com uma etapa extra:

- roots sao ordenados por `startTime ASC`
- filhos tambem sao ordenados por `startTime ASC`
- o flatten final e depth-first
- nos colapsados param a expansao do ramo

Referencias:

- roots ordenados: `timeline-flattening.ts:38-41`
- filhos ordenados: `timeline-flattening.ts:117-120`
- DFS com stack reversa: `timeline-flattening.ts:43-58` e `122-134`

### Como a posicao horizontal e calculada

Para cada no:

- `startOffset` = distancia do inicio do trace
- `itemWidth` = duracao do span

Isso e precomputado no flatten para evitar recalculo durante a renderizacao.

Referencia:

- `timeline-flattening.ts:65-101`

Entao:

- ordem vertical = hierarquia + cronologia
- posicao horizontal = tempo relativo dentro do trace

---

## 8. Como o graph view funciona

Arquivos:

- `components/trace2/components/TraceGraphView/TraceGraphView.tsx`
- `contexts/TraceGraphDataContext.tsx`
- `features/trace-graph-view/components/TraceGraphView.tsx`
- `features/trace-graph-view/buildStepData.ts`
- `features/trace-graph-view/buildGraphCanvasData.ts`
- `features/trace-graph-view/components/TraceGraphCanvas.tsx`

### Quando o graph view aparece

O `TraceGraphDataProvider` busca `agentGraphData` e define `isGraphViewAvailable`.

Ele nao mostra graph se:

- nao ha dados
- o trace e grande demais
- nao ha observations “graficaveis”

Tambem existe limite para desabilitar physics:

- graph gigante: physics off

Referencias:

- origem do graph data e disponibilidade: `TraceGraphDataContext.tsx:1-132`
- composicao visual no `Trace`: `Trace.tsx:100-167`

### Como ele decide o modelo do grafo

No `features/.../TraceGraphView.tsx`:

1. se os dados nao tem `step`, ele cria steps artificialmente com `buildStepData`
2. se parecem dados de LangGraph, normaliza com `transformLanggraphToGeneralized`
3. depois monta `graph` e `nodeToObservationsMap` com `buildGraphFromStepData`

Referencia:

- `features/trace-graph-view/components/TraceGraphView.tsx:46-68`

### Como `buildStepData` decide a ordem dos steps

Esse arquivo nao monta uma arvore temporal detalhada como `trace2/tree-building`.
Ele cria uma representacao “por etapas”.

Regra:

1. ordena observations por `startTime`
2. agrupa observacoes que se sobrepoem no tempo no mesmo `step`
3. observacoes sequenciais vao para `steps` seguintes
4. depois aplica uma restricao extra: filho precisa estar em `parent.step + 1` ou maior
5. se essa restricao quebrar a timeline original, os steps seguintes sao empurrados para frente

Referencias:

- agrupamento temporal: `buildStepData.ts:8-80`
- ordenacao por start time: `buildStepData.ts:99-104`
- atribuicao de step: `buildStepData.ts:106-114`
- restricao parent-child: `buildStepData.ts:116-186`

Isso e uma diferenca importante:

- na tree/timeline, a ordem vem de hierarquia + cronologia
- no graph, a ordem vem de “camadas” (`step`) derivadas do tempo e depois corrigidas para respeitar pai-filho

### Como as arestas sao geradas

`buildGraphFromStepData`:

- cria `stepToNodesMap`
- cria um `nodeToObservationsMap`
- gera um no por nome
- conecta todos os nos do step atual a todos os nos do proximo step
- o ultimo step conecta ao `__end_lf__`

Referencias:

- mapeamento step -> nodes: `buildGraphCanvasData.ts:96-107`
- mapeamento node -> observations: `buildGraphCanvasData.ts:97-139`
- edges entre steps: `buildGraphCanvasData.ts:175-205`

Isso quer dizer que o graph nao representa exatamente cada aresta pai-filho real entre spans.
Ele representa mais um fluxo por etapas/camadas.

### Como ele renderiza de fato

O canvas usa:

- `vis-network/standalone`

E configura:

- `layout.hierarchical.enabled = true`
- `direction = "UD"`
- `sortMethod = "hubsize"`

Referencia:

- `TraceGraphCanvas.tsx:166-229`

Interacoes:

- clique em no seleciona observation via query param `observation`
- se o mesmo no tem varias observations, clique repetido faz cycle entre elas

Referencias:

- sincronizacao com URL: `TraceGraphView.tsx:78-121`
- clique/cycle: `TraceGraphView.tsx:123-176`
- binding do click no vis-network: `TraceGraphCanvas.tsx:269-287`

### Conclusao sobre o graph

O graph view nao e o renderer primario do encadeamento fiel span-a-span.

Ele e uma visualizacao derivada, mais semantica, baseada em:

- steps
- nodes por nome
- edges entre steps

Para o encadeamento “real” do trace, a fonte mais fiel e:

- `tree-building.ts`
- `TraceTree`
- `TraceTimeline`

---

## 9. Onde a renderizacao fiel ponta a ponta realmente acontece

Se a pergunta for “qual parte mostra a cadeia real de spans/observations de ponta a ponta?” a resposta e:

- `TraceDataProvider` + `buildTraceUiData`
- `TraceTree`
- `TraceTimeline`

Porque ali o frontend usa:

- `parentObservationId` real
- `startTime` real
- profundidade real
- filhos reais

O graph view ja e uma interpretacao resumida.

---

## 10. Resposta direta: o que ele usa, como renderiza, como ordena

### O que ele usa

Para a pagina `/traces`:

- `TracesTable` no modo legacy
- `ObservationsEventsTable` no modo v4

Para o detalhe do trace:

- `TracePage`
- `Trace`
- `TraceDataProvider`
- `TraceTree`
- `TraceTimeline`
- `TraceDetailView`
- `ObservationDetailView`
- opcionalmente `TraceGraphView`

### Como ele renderiza o encadeamento

1. Carrega `trace + observations + scores`.
2. Normaliza as observations.
3. Monta arvore por `parentObservationId`.
4. Ordena roots e filhos por `startTime`.
5. Gera estrutura virtualizada para arvore/busca/timeline.
6. Seleciona um no via query param `observation`.
7. Mostra o detalhe da observation selecionada no painel direito.

### Como ele decide a ordem dos traces

Na lista `/traces`:

- `timestamp DESC` por default

### Como ele decide a ordem dos spans/observations

Na arvore/timeline:

- primeiro hierarquia por `parentObservationId`
- dentro de cada conjunto de irmaos, `startTime ASC`
- roots tambem em `startTime ASC`
- flatten visual em DFS pre-order

No graph:

- agrupa por sobreposicao temporal em `steps`
- depois corrige para garantir `child.step >= parent.step + 1`
- desenha edges do step N para o N+1

---

## 11. Minha leitura arquitetural

O frontend atual tem duas representacoes diferentes do mesmo trace:

1. representacao estrutural fiel:
   - tree
   - timeline
2. representacao semantica/derivada:
   - graph view

Se voce quer reproduzir o comportamento “encadeamento ponta a ponta” em outro lugar, eu usaria como referencia principal:

- `components/trace2/lib/tree-building.ts`
- `components/trace2/components/TraceTree.tsx`
- `components/trace2/components/TraceTimeline/timeline-flattening.ts`

Se voce quer reproduzir especificamente o “grafo bonito”:

- `features/trace-graph-view/buildStepData.ts`
- `features/trace-graph-view/buildGraphCanvasData.ts`
- `features/trace-graph-view/components/TraceGraphCanvas.tsx`

Mas eu nao trataria esse graph como a verdade canonica do encadeamento.

---

## 12. Arquivos mais importantes para continuar a investigacao

- `otel/langfuse/web/src/components/trace2/TracePage.tsx`
- `otel/langfuse/web/src/components/trace2/Trace.tsx`
- `otel/langfuse/web/src/components/trace2/contexts/TraceDataContext.tsx`
- `otel/langfuse/web/src/components/trace2/lib/tree-building.ts`
- `otel/langfuse/web/src/components/trace2/components/TraceTree.tsx`
- `otel/langfuse/web/src/components/trace2/components/TraceTimeline/index.tsx`
- `otel/langfuse/web/src/components/trace2/components/TraceTimeline/timeline-flattening.ts`
- `otel/langfuse/web/src/features/events/hooks/useEventsTraceData.ts`
- `otel/langfuse/web/src/features/events/lib/eventsToTraceAdapter.ts`
- `otel/langfuse/web/src/features/trace-graph-view/buildStepData.ts`
- `otel/langfuse/web/src/features/trace-graph-view/buildGraphCanvasData.ts`
- `otel/langfuse/web/src/features/trace-graph-view/components/TraceGraphCanvas.tsx`

