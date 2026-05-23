# Análise do card lateral de logs/traces no HyperDX

Base analisada: `/home/gabriel-carvalho/Documents/loglog/otel/hyperdx/packages/app`

## Resumo executivo

O card que abre ao clicar em uma linha de log/trace é centrado no componente [`DBRowSidePanel`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx). Ele não é um painel genérico: existe uma estrutura fixa de abas e vários comportamentos assumem schema OTEL ou nomes de atributos já conhecidos.

As abas principais observadas são:

- `Overview`
- `Column Values`
- `Trace`
- `Service Map`
- `Surrounding Context`
- `Session Replay`
- `Infrastructure`

As abas disponíveis variam conforme o `source`, a presença de `traceId`, sessão correlacionada e atributos de Kubernetes. A aba `Trace` é a mais importante para o seu caso e é montada por [`DBTracePanel`](../../../otel/hyperdx/packages/app/src/components/DBTracePanel.tsx), que por sua vez usa [`DBTraceWaterfallChartContainer`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx).

## Onde o painel nasce

O fluxo principal é:

1. A tabela gera um `rowWhere` para a linha clicada.
2. O drawer lateral abre com `DBRowSidePanel`.
3. `DBRowSidePanel` chama `useRowData()` para buscar a linha completa.
4. A partir dessa linha ele habilita/desabilita abas e monta os subpainéis.

Arquivos-chave:

- [`DBSqlRowTableWithSidebar.tsx`](../../../otel/hyperdx/packages/app/src/components/DBSqlRowTableWithSidebar.tsx)
- [`DBRowSidePanel.tsx`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx)
- [`DBRowDataPanel.tsx`](../../../otel/hyperdx/packages/app/src/components/DBRowDataPanel.tsx)

Pontos importantes:

- `DBRowSidePanel` define as abas fixas no enum `Tab` e escolhe a aba default. Para `trace`, a default já é `Trace`; para `log`, normalmente começa em `Overview` ou `Column Values` ([`DBRowSidePanel.tsx:82-91`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:82), [`DBRowSidePanel.tsx:172-190`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:172)).
- O `Trace` tab sempre existe visualmente, mas o conteúdo útil depende de haver `traceId` e um `trace source` correlacionado ([`DBRowSidePanel.tsx:341-392`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:341)).
- `Service Map` só aparece se existir `traceId` e `traceSourceId` ([`DBRowSidePanel.tsx:276-277`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:276), [`DBRowSidePanel.tsx:361-368`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:361)).

## O que já é pré-alocado/hardcoded na UI

### 1. Estrutura fixa de abas

A UI do side panel já reserva espaço conceitual para estas áreas:

- `Overview`
- `Column Values`
- `Trace`
- `Service Map`
- `Surrounding Context`
- `Session Replay`
- `Infrastructure`

Isso é hardcoded em [`DBRowSidePanel.tsx:82-91`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:82) e renderizado em [`DBRowSidePanel.tsx:341-392`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:341).

### 2. Overview com seções OTEL já assumidas

O `Overview` não é totalmente schema-driven. Ele já tenta renderizar blocos específicos:

- `HTTP Request`
- `Exception`
- `Span Events`
- `Top Level Attributes`
- `Log Attributes` ou `Span Attributes`
- `Resource Attributes`

Isso está em [`DBRowOverviewPanel.tsx:202-308`](../../../otel/hyperdx/packages/app/src/components/DBRowOverviewPanel.tsx:202).

### 3. Campos top-level fixos

Existe uma lista hardcoded de atributos top-level:

- `ServiceName`
- `SpanName`
- `Duration`
- `SeverityText`
- `StatusCode`
- `StatusMessage`
- `SpanKind`
- `TraceId`
- `SpanId`
- `ParentSpanId`
- `ScopeName`
- `ScopeVersion`

Essa lista está em [`DBRowOverviewPanel.tsx:69-93`](../../../otel/hyperdx/packages/app/src/components/DBRowOverviewPanel.tsx:69).

Conclusão: sim, já existem campos/áreas pré-alocados para atributos OTEL bem específicos.

### 4. Heurísticas prontas para HTTP e exception

O painel detecta request HTTP se `eventAttributes["http.url"]` existir e, nesse caso:

- mostra um bloco `HTTP Request`
- remove chaves `http.*` da seção geral de event attributes para evitar duplicação

Isso acontece em [`DBRowOverviewPanel.tsx:121-139`](../../../otel/hyperdx/packages/app/src/components/DBRowOverviewPanel.tsx:121) e [`DBRowOverviewPanel.tsx:215-229`](../../../otel/hyperdx/packages/app/src/components/DBRowOverviewPanel.tsx:215).

Também há parsing específico de exceptions a partir de `__hdx_events_exception_attributes`, incluindo tentativa de parse de `exception.stacktrace` como JSON ([`DBRowOverviewPanel.tsx:141-172`](../../../otel/hyperdx/packages/app/src/components/DBRowOverviewPanel.tsx:141)).

### 5. Span events já são tratados como primeira classe

`useRowData()` já busca:

- `__hdx_events_exception_attributes`
- `__hdx_span_events`

quando o source é trace e há `spanEventsValueExpression` ([`DBRowDataPanel.tsx:134-145`](../../../otel/hyperdx/packages/app/src/components/DBRowDataPanel.tsx:134)).

Ou seja: a UI já nasce esperando que eventos de span possam existir e aparecer tanto no overview quanto no waterfall.

## O que é configurável por source

Apesar de haver bastante coisa hardcoded, a base da correlação e do render vem do `source`.

Campos relevantes do log source:

- `traceSourceId`
- `traceIdExpression`
- `spanIdExpression`
- `highlightedRowAttributeExpressions`
- `highlightedTraceAttributeExpressions`

Campos relevantes do trace source:

- `logSourceId`
- `traceIdExpression`
- `spanIdExpression`
- `parentSpanIdExpression`
- `spanNameExpression`
- `spanKindExpression`
- `statusCodeExpression`
- `statusMessageExpression`
- `serviceNameExpression`
- `eventAttributesExpression`
- `resourceAttributesExpression`
- `spanEventsValueExpression`
- `highlightedRowAttributeExpressions`
- `highlightedTraceAttributeExpressions`

Referências do form:

- log source: [`SourceForm.tsx:1218-1315`](../../../otel/hyperdx/packages/app/src/components/Sources/SourceForm.tsx:1218)
- trace source: [`SourceForm.tsx:1337-1629`](../../../otel/hyperdx/packages/app/src/components/Sources/SourceForm.tsx:1337)

## Como a correlação log ↔ trace acontece

### 1. A linha selecionada precisa trazer aliases padrão

`useRowData()` sempre tenta buscar aliases normalizados como:

- `__hdx_trace_id`
- `__hdx_span_id`
- `__hdx_timestamp`
- `__hdx_body`
- `__hdx_event_attributes`
- `__hdx_resource_attributes`

Referência: [`DBRowDataPanel.tsx:19-30`](../../../otel/hyperdx/packages/app/src/components/DBRowDataPanel.tsx:19), [`DBRowDataPanel.tsx:65-157`](../../../otel/hyperdx/packages/app/src/components/DBRowDataPanel.tsx:65).

### 2. O side panel descobre o source correlacionado

Em `DBRowSidePanel`:

- se a linha aberta é de `log`, `childSourceId = source.traceSourceId`
- se a linha aberta é de `trace`, `childSourceId = source.logSourceId`

Referência: [`DBRowSidePanel.tsx:262-274`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:262).

### 3. O `traceId` da linha aberta vira pivô da consulta

O `traceId` lido da linha é `normalizedRow["__hdx_trace_id"]` ([`DBRowSidePanel.tsx:259-260`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:259)).

Esse `traceId` é passado para `DBTracePanel`, que entrega o valor ao waterfall ([`DBRowSidePanel.tsx:424-433`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:424), [`DBTracePanel.tsx:232-242`](../../../otel/hyperdx/packages/app/src/components/DBTracePanel.tsx:232)).

### 4. Se o `traceIdExpression` estiver errado, a UI deixa editar

`DBTracePanel` mostra o `traceIdExpression` do source pai e deixa editar/salvar direto ali, atualizando o source via `useUpdateSource()` ([`DBTracePanel.tsx:154-229`](../../../otel/hyperdx/packages/app/src/components/DBTracePanel.tsx:154)).

Isso é um sinal importante: a correlação depende fortemente da configuração do source, não só do schema físico.

## Análise detalhada do trecho que renderiza o trace

## Componente central

O núcleo é [`DBTraceWaterfallChartContainer`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx).

Ele faz 5 coisas principais:

1. monta consultas para spans e logs correlacionados
2. junta e ordena os resultados por timestamp com precisão nanosegundo
3. reconstrói uma árvore/DAG de spans usando `SpanId` e `ParentSpanId`
4. transforma essa árvore em linhas de timeline
5. renderiza tudo em `TimelineChart`

### 1. Como ele monta as consultas

`getConfig()` cria um `ChartConfig` por source, com aliases estáveis:

- `Body`
- `Timestamp`
- `Duration`
- `TraceId`
- `SpanId`
- `ParentSpanId`
- `StatusCode`
- `ServiceName`
- `SeverityText`
- `SpanAttributes`
- `SpanEvents`

Referência: [`DBTraceWaterfallChart.tsx:128-277`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:128).

O filtro principal é simples:

- `where: ${alias.TraceId} = '${traceId}'`

em [`DBTraceWaterfallChart.tsx:268-275`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:268).

Observação importante: não existe join entre logs e spans no waterfall. A correlação é feita por `TraceId`, consultando separadamente:

- o trace source
- o log source correlacionado

e misturando os resultados no frontend.

### 2. Quais chamadas ele faz

`DBTraceWaterfallChartContainer` chama `useEventsAroundFocus()` duas vezes:

- uma para spans (`traceTableSource`)
- outra para logs (`logTableSource`)

Referência: [`DBTraceWaterfallChart.tsx:472-499`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:472).

Dentro de `useEventsAroundFocus()`:

- `getConfig()` gera o config
- `useEventsData()` executa duas buscas com `useOffsetPaginatedQuery()`
  - janela antes do `focusDate`
  - janela depois do `focusDate`

Referências:

- [`DBTraceWaterfallChart.tsx:279-298`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:279)
- [`DBTraceWaterfallChart.tsx:300-383`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:300)

Isso significa que o trace panel não busca “o trace inteiro do banco sem contexto temporal”; ele usa `traceId` + `dateRange` + `focusDate`.

### 3. Como ele correlaciona spans e logs

Correlação básica:

- spans e logs são buscados pelo mesmo `TraceId`
- logs entram no mesmo array `rows`
- todos são ordenados por timestamp

Referência: [`DBTraceWaterfallChart.tsx:504-518`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:504).

Correlação estrutural:

- apenas spans de fato definem a árvore “canônica”
- `validSpanIDs` é extraído só de `traceRowsData`
- logs com `SpanId` entram como filhos do span com o mesmo `SpanId`

Referência: [`DBTraceWaterfallChart.tsx:591-597`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:591), [`DBTraceWaterfallChart.tsx:607-667`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:607).

Detalhe muito importante:

- para logs, `nodeSpanId = ${SpanId}-log`
- para logs, `nodeParentSpanId = SpanId`

Isso faz o log virar um nó folha “pendurado” no span correspondente, sem sobrescrever o span real.

Esse é exatamente o ponto onde o HyperDX “mistura” spans e logs na árvore.

### 4. Como ele lida com casos ruins/incompletos

O código já comenta 3 edge cases:

- trace sem spans, só logs
- trace com spans intermediários faltando
- múltiplas raízes/disjoint traces

Referência: [`DBTraceWaterfallChart.tsx:579-584`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:579).

Além disso, se um pai ainda não foi encontrado, ele cria placeholders temporários (`placeholder-${spanId}`), depois reaproveitados quando o span real aparece ([`DBTraceWaterfallChart.tsx:628-635`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:628), [`DBTraceWaterfallChart.tsx:656-663`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:656)).

### 5. Como ele plota

Depois de montar a árvore, ele gera `flattenedNodes` via DFS/in-order traversal com nível (`level`) para controlar indentação visual ([`DBTraceWaterfallChart.tsx:670-694`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:670)).

Cada linha de timeline recebe:

- label textual com indentação
- ícone para logs correlacionados
- toggle de collapse/expand
- `start` e `end` em ms relativos ao menor timestamp
- cor baseada em status
- markers de span events

Referência: [`DBTraceWaterfallChart.tsx:752-927`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:752).

Conversão temporal:

- `start = timestamp - minOffset`
- `end = start + duration`

com `duration` em segundos sendo convertido para ms ([`DBTraceWaterfallChart.tsx:755-758`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:755)).

### 6. Como ele destaca o span/log clicado

O item ativo é identificado por `highlightedRowWhere`, que vem de `eventRowWhere.id` guardado na query string ([`DBTracePanel.tsx:109-112`](../../../otel/hyperdx/packages/app/src/components/DBTracePanel.tsx:109), [`DBTracePanel.tsx:239-240`](../../../otel/hyperdx/packages/app/src/components/DBTracePanel.tsx:239)).

Ao clicar em uma linha/evento:

- o waterfall chama `onClick`
- isso salva `{ id, type, aliasWith }`
- o painel abaixo renderiza `RowOverviewPanel` ou `RowDataPanel` daquele evento

Referências:

- [`DBTraceWaterfallChart.tsx:815-817`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:815)
- [`DBTraceWaterfallChart.tsx:1065-1083`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:1065)
- [`DBTracePanel.tsx:244-287`](../../../otel/hyperdx/packages/app/src/components/DBTracePanel.tsx:244)

### 7. Como ele posiciona o primeiro highlight

Quando você abre o trace a partir de uma linha já selecionada, o side panel passa um `initialRowHighlightHint` com:

- timestamp
- spanId
- body

Depois o waterfall procura a linha equivalente dentro dos `rows` e já seleciona automaticamente esse item ([`DBRowSidePanel.tsx:302-310`](../../../otel/hyperdx/packages/app/src/components/DBRowSidePanel.tsx:302), [`DBTraceWaterfallChart.tsx:559-577`](../../../otel/hyperdx/packages/app/src/components/DBTraceWaterfallChart.tsx:559)).

## Como a timeline em si funciona

O desenho não usa uma lib pronta de tracing como Jaeger/Tempo UI. O HyperDX usa um componente próprio:

- [`TimelineChart`](../../../otel/hyperdx/packages/app/src/components/TimelineChart/TimelineChart.tsx)

Esse componente fornece:

- virtualização com `@tanstack/react-virtual`
- zoom horizontal via `Ctrl/Cmd + scroll`
- pan horizontal via wheel/drag
- label column redimensionável

Referências:

- zoom/pan: [`TimelineChart.tsx:82-156`](../../../otel/hyperdx/packages/app/src/components/TimelineChart/TimelineChart.tsx:82)
- virtualização: [`TimelineChart.tsx:168-190`](../../../otel/hyperdx/packages/app/src/components/TimelineChart/TimelineChart.tsx:168)
- render das rows: [`TimelineChart.tsx:249-307`](../../../otel/hyperdx/packages/app/src/components/TimelineChart/TimelineChart.tsx:249)

Em outras palavras: o “plot” do trace é um waterfall/timeline custom, não uma biblioteca específica de distributed tracing.

## Bibliotecas/UI/libs usadas nessa área

### UI geral

- `@mantine/core`
- `@mantine/hooks`
- `@tabler/icons-react`
- `react-error-boundary`
- `react-hook-form`
- `nuqs`

### Trace waterfall

- `timestamp-nano`
  - usado para ordenação com precisão de nanossegundos
- `@tanstack/react-virtual`
  - virtualização das linhas da timeline
- `lodash`
  - utilidades de tree/omit/etc

### Service map

- `@xyflow/react`
  - render do grafo interativo
- `@dagrejs/dagre`
  - layout automático left-to-right

## Como o service map é feito

O `Service Map` não reaproveita a árvore do waterfall. Ele faz uma consulta própria em [`useServiceMap.tsx`](../../../otel/hyperdx/packages/app/src/hooks/useServiceMap.tsx).

Estratégia:

1. gera uma CTE de spans servidor
2. gera uma CTE de spans cliente
3. faz `LEFT JOIN` por:
   - `traceId`
   - `ServerSpans.parentSpanId = ClientSpans.spanId`
4. agrega por serviço servidor, status e serviço cliente

Referência: [`useServiceMap.tsx:35-134`](../../../otel/hyperdx/packages/app/src/hooks/useServiceMap.tsx:35).

Depois:

- agrega em memória em `Map<string, ServiceAggregation>` ([`useServiceMap.tsx:149-242`](../../../otel/hyperdx/packages/app/src/hooks/useServiceMap.tsx:149))
- cria nodes/edges React Flow ([`ServiceMap.tsx:119-168`](../../../otel/hyperdx/packages/app/src/components/ServiceMap/ServiceMap.tsx:119))
- roda layout Dagre ([`ServiceMap.tsx:39-71`](../../../otel/hyperdx/packages/app/src/components/ServiceMap/ServiceMap.tsx:39))

Então, no HyperDX:

- waterfall = mistura spans + logs no frontend, por `TraceId`/`SpanId`
- service map = query separada, baseada em `SpanKind` e join entre client/server spans

## Como o Surrounding Context funciona

O `Surrounding Context` é outro fluxo separado. Ele não depende do trace tree.

Ele:

- pega timestamp da linha atual
- monta uma janela temporal (`±100ms` até `±15m`)
- opcionalmente restringe por `service.name`, `host.name`, `k8s.pod.name`, `k8s.node.name` ou filtro custom
- renderiza uma nova tabela
- ao clicar numa linha dessa tabela, abre outro `DBRowSidePanel` aninhado

Referência principal: [`ContextSidePanel.tsx:77-339`](../../../otel/hyperdx/packages/app/src/components/ContextSidePanel.tsx:77).

Isso confirma que `Surrounding Context` é um painel irmão do `Trace`, não um recurso interno do waterfall.

## Assunções de schema OTEL que aparecem no frontend

Além das expressões configuráveis por source, o frontend ainda assume muitos nomes/conceitos OTEL:

- `TraceId`
- `SpanId`
- `ParentSpanId`
- `SpanName`
- `SpanKind`
- `ServiceName`
- `StatusCode`
- `StatusMessage`
- `Duration`
- `ResourceAttributes`
- `SpanAttributes`
- `LogAttributes`
- `Events`
- `http.url`
- `http.method`
- `exception.stacktrace`
- `exception.parsed_stacktrace`
- `exception.type`
- `exception.message`
- `exception.mechanism`
- `k8s.node.name`
- `k8s.pod.name`
- `host.name`
- `service.name`

Parte disso é “inferida” automaticamente quando o source parece OTEL padrão em [`source.ts:317-387`](../../../otel/hyperdx/packages/app/src/source.ts:317).

## Conclusões práticas para o LogLog

### O que vale reaproveitar conceitualmente

- modelo de side panel com abas fixas
- separação entre `Overview`, `Raw/Column Values`, `Trace`, `Context`
- correlação de logs no waterfall por `TraceId` + encaixe no span por `SpanId`
- timeline custom com virtualização
- service map separado do waterfall

### O que você precisa observar se quiser portar a ideia

- o HyperDX depende bastante da configuração de `source`
- o frontend assume muitos nomes OTEL mesmo quando o source é configurável
- o waterfall mistura dados no frontend; não existe uma consulta única já pronta com a árvore completa
- a identificação de linha (`rowWhere`) é central, porque ela permite abrir os detalhes de spans/logs clicados sem manter objetos pesados em estado

### Resposta direta às suas perguntas

- “ele tem algum campos na ui que ja pre alocados para certos atributos?”
  - Sim. Principalmente em `Overview`, `Top Level Attributes`, `HTTP Request`, `Exception`, `Span Events`, `Resource Attributes`, `Log/Span Attributes`, além das próprias abas `Trace`, `Service Map` e `Surrounding Context`.

- “como ele renderiza o trace?”
  - Busca spans e logs correlacionados por `TraceId`, ordena por timestamp com precisão nano, reconstrói uma árvore usando `SpanId` e `ParentSpanId`, pendura logs no span de mesmo `SpanId`, aplaina a árvore em linhas e renderiza num `TimelineChart` próprio.

- “quais chamadas ele faz?”
  - Duas chamadas principais via `useEventsAroundFocus()`/`useOffsetPaginatedQuery()`: uma para spans e outra para logs correlacionados. O service map faz outra query separada via `useServiceMap()`.

- “como correlaciona?”
  - `TraceId` para juntar spans e logs de um mesmo trace; `SpanId`/`ParentSpanId` para montar a hierarquia; logs usam `SpanId` como ponte para anexar ao span correspondente.

- “como ele plota e mistura?”
  - Mistura no frontend, não no backend. O array combinado é ordenado, transformado em DAG/árvore e depois em linhas de timeline.

- “como ui/libs usa para fazer isso?”
  - `Mantine` para UI, `react-hook-form` e `nuqs` para estado, `@tanstack/react-virtual` para timeline virtualizada, `timestamp-nano` para ordenação temporal, `@xyflow/react` + `dagre` para service map.

