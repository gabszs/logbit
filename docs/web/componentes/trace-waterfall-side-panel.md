# Trace waterfall side panel

## Objetivo

Este documento registra a implementacao do painel lateral de trace no drawer de
detalhes de uma linha de log/trace/span.

O painel combina duas referencias:

- visual inspirado no Langfuse: arvore compacta de trace, linhas de hierarquia,
  icones por tipo e duracao por linha
- logica inspirada no HyperDX: spans formam a arvore por `SpanId` e
  `ParentSpanId`; logs entram no mesmo waterfall por `TraceId` e sao pendurados
  no span de mesmo `SpanId`; a linha aberta passa uma dica inicial para focar o
  node correspondente dentro do waterfall

Nao foi implementado timeline horizontal, graph view ou service map.

## Paths principais

- `apps/web/src/components/data-row-side-panel/data-row-side-panel.tsx`
  - integra o painel de trace dentro do drawer de detalhes
  - renderiza o painel a esquerda quando a linha carregada tem contexto de trace
- `apps/web/src/components/data-row-side-panel/types.ts`
  - define o contrato opcional do adapter para trace
  - inclui `RowTracePanelDescriptor` e `RowTracePanelQueryResult`
  - reexporta `DataRow`, mas a definicao canonica vive em
    `apps/web/src/lib/data-row.ts`
- `apps/web/src/lib/data-row.ts`
  - tipo neutro `DataRow = Record<string, unknown>`
  - evita ciclo de tipos entre `data-row-side-panel` e `trace-waterfall`
- `apps/web/src/components/trace-waterfall/trace-waterfall-panel.tsx`
  - componente visual reutilizavel do painel
  - controla busca, collapse, selecao, download JSON e render da arvore
- `apps/web/src/components/trace-waterfall/trace-waterfall-model.ts`
  - builder puro da arvore
  - normaliza spans/logs, ordena, monta hierarquia, filtra busca e resolve
    highlight inicial
- `apps/web/src/components/trace-waterfall/trace-waterfall-model.test.ts`
  - testes unitarios do builder e do resolver de highlight
- `apps/web/src/routes/logs/-lib/logs-row-panel.ts`
  - implementa a correlacao log -> trace source
  - monta queries ClickHouse para spans e logs
  - constroi identidades canonicas quando uma linha do waterfall e clicada
- `apps/web/src/routes/logs/-lib/logs-row-panel.test.ts`
  - testes do adapter de row identity e resolucao de campos log/span
- `apps/web/src/routes/logs/route.tsx`
  - carrega todos os sources para resolver `traceSourceId`
  - passa `setSelectedRowIdentity` para o drawer, permitindo que cliques no
    waterfall recarreguem o painel principal
- `apps/web/.env.example`
  - documenta `VITE_LOGLOG_TRACE_WATERFALL_LIMIT`

## Contrato do adapter

O `RowPanelAdapter` segue generico para o drawer, mas ganhou capacidades
opcionais:

- `getTracePanel(row, fields)`
  - decide se o painel deve aparecer
  - retorna `null`, `setup-required` ou `available`
- `getTraceQueryKey(identity, tracePanel)`
  - gera chave de cache do TanStack Query para o trace
- `fetchTrace(identity, tracePanel)`
  - busca spans e logs crus para o `traceId`
- `getTraceNodeRowIdentity(identity, tracePanel, selection)`
  - opcional
  - recebe a selecao de um node do waterfall
  - retorna uma `RowIdentity` canonica para recarregar o painel principal

`RowTracePanelAvailable` tambem aceita:

- `initialHighlightHint`
  - dica inicial para localizar a row aberta dentro do waterfall carregado
  - nao e estado controlado permanente
  - nao bloqueia selecao manual posterior

Estados possiveis:

- sem `TraceId` e sem `SpanId`: nao renderiza painel
- tem attrs de trace/span, mas nao tem source correlacionado: renderiza estado de
  setup
- tem `traceSourceId` valido e `TraceId`: busca trace

## Regras de interacao

Fluxo ao abrir uma linha:

1. A tabela cria uma `RowIdentity` para a linha clicada.
2. O drawer busca a linha canonica por `rowWhere`.
3. O adapter resolve campos principais (`Body` para log, `SpanName` para span).
4. Se existe contexto de trace, `getTracePanel` cria `initialHighlightHint`.
5. Quando o waterfall fica pronto, o model resolve o node mais provavel.
6. O painel seleciona esse node, expande ancestrais e faz
   `scrollIntoView({ block: "nearest" })`.

Fluxo ao clicar dentro do waterfall:

- clique na linha seleciona o node e tenta recarregar o painel principal com os
  dados canonicos daquela linha
- clique no chevron apenas expande/colapsa e usa `stopPropagation`
- linhas visiveis usam cursor de clique
- o wrapper interno `TRACE` nao e clicavel porque nao e renderizado; o root
  clicavel e o root span real
- se o node nao tiver `raw` ou nao gerar predicados suficientes, apenas a selecao
  visual muda; o painel principal fica como esta

## Highlight inicial

Tipo principal: `TraceWaterfallInitialHighlightHint`.

Regras:

- `kind` e `"span"` para row detectada como span-like; caso contrario `"log"`
- matching usa aliases normalizados da row e dos eventos do trace
- score considera `kind`, `traceId`, `spanId`, timestamp normalizado,
  `body`/`name`, `severityText` e `serviceName`
- fallback para span do mesmo `spanId`
- fallback final para primeiro node visivel
- duplicatas perfeitas selecionam a primeira ocorrencia ordenada

Campos `rowWhere` e `selectedRowKey`, se aparecerem no tipo, ficam reservados
para fluxo futuro no estilo HyperDX. A v1 nao usa esses campos para matching.

## Correlacao de source

No contexto de logs:

- o log source usa `source.config.traceSourceId`
- esse id aponta para o trace source que contem spans
- o proprio log source e usado como fonte de logs correlacionados

Fluxo em `createLogsRowPanelAdapter(source, allSources)`:

1. `resolveLogsRowFields` extrai `traceId` e `spanId` da linha aberta.
2. `getTracePanel` verifica se existe contexto de trace.
3. Se `traceSourceId` nao existe, retorna `setup-required`.
4. Se `traceSourceId` existe, procura esse source em `allSources`.
5. Se o source existe e e do tipo `trace`, retorna `available`.
6. `fetchTrace` executa duas consultas:
   - uma no trace source, buscando spans
   - uma no log source, buscando logs

Quando o usuario clica em um node do waterfall:

- node `log`
  - gera `RowIdentity` contra o log source
  - monta `rowWhere` com campos configurados do log source e aliases
    `__loglog_trace_*`
- node `span`
  - gera `RowIdentity` contra o trace source
  - monta `rowWhere` com campos configurados do trace source e aliases
    `__loglog_trace_*`
- `selectedRowKey` usa `${source.id}:${rowWhere}`
- `tableLabel` usa o source real clicado, log ou trace

`fetchRow` no adapter aceita `identity.sourceId` do log source ou do trace
source. Para trace source, executa uma query de detalhe com aliases
normalizados de trace e `LIMIT 2`.

## Query ClickHouse

As queries nao usam janela temporal.

As expressoes configuradas sao resolvidas uma vez por helpers privados:

- `getTraceFieldExpressions(traceSource)`
- `getLogFieldExpressions(logSource)`

Esses helpers sao reutilizados nas queries do waterfall, nas queries de detalhe
e nos builders de `rowWhere`, para evitar drift entre campos configurados.

Forma conceitual dos spans:

```sql
SELECT *,
  <timestampField> AS __loglog_trace_timestamp,
  <traceIdField> AS __loglog_trace_trace_id,
  <spanIdField> AS __loglog_trace_span_id,
  <parentSpanIdField> AS __loglog_trace_parent_span_id,
  <spanNameField> AS __loglog_trace_name,
  <serviceNameField> AS __loglog_trace_service_name,
  <durationField> AS __loglog_trace_duration,
  <statusCodeField> AS __loglog_trace_status_code,
  <statusMessageField> AS __loglog_trace_status_message,
  <spanKindField> AS __loglog_trace_span_kind
FROM <traceDatabase>.<traceTable>
WHERE toString(<traceIdField>) = '<traceId>'
ORDER BY <timestampField> ASC
LIMIT <limit>
```

Forma conceitual dos logs:

```sql
SELECT *,
  <timestampField> AS __loglog_trace_timestamp,
  <traceIdField> AS __loglog_trace_trace_id,
  <spanIdField> AS __loglog_trace_span_id,
  <serviceNameField> AS __loglog_trace_service_name,
  <bodyField> AS __loglog_trace_body,
  <severityField> AS __loglog_trace_severity_text
FROM <logDatabase>.<logTable>
WHERE toString(<traceIdField>) = '<traceId>'
ORDER BY <timestampField> ASC
LIMIT <limit>
```

O limite vem de:

```env
VITE_LOGLOG_TRACE_WATERFALL_LIMIT="5000"
```

Default em codigo: `5000`.

## Dados exibidos no painel principal

O painel principal e o mesmo para logs e spans, mas a resolucao de campos muda
conforme a row:

- log
  - texto principal: `Body`
  - tab de valores: `Log Values`
  - overview usa `Log Attributes`
- span/root span
  - texto principal: `SpanName`
  - label visual no body continua uppercase, com tratamento para renderizar
    `SPAN-NAME` em vez de `SPANNAME`
  - tab de valores: `Span Values`
  - overview usa `Span Attributes`

`Column Values` remove aliases tecnicos:

- `__loglog_row_selector_*`
- `__loglog_trace_*`

## Builder da arvore

Arquivo: `trace-waterfall-model.ts`.

Entrada:

```ts
type BuildTraceWaterfallTreeInput = {
  traceId: string;
  spans: DataRow[];
  logs: DataRow[];
  durationPrecision?: number | null;
};
```

Regras:

1. Spans sao normalizados para `TraceWaterfallNode`.
2. Logs sao normalizados para `TraceWaterfallNode`.
3. Timestamps viram nanossegundos (`bigint`) quando possivel.
4. Duracao usa `durationPrecision`, default `9`.
5. Spans sao ordenados por `startTimeNs ASC`.
6. Spans formam arvore usando:
   - `spanId`
   - `parentSpanId`
7. Span com parent ausente vira root.
8. Log com `SpanId` correspondente vira filho do span.
9. Log sem `SpanId` vira root com warning `missing-span-id`.
10. Log com `SpanId` sem span correspondente vira root com warning
    `unmatched-span-id`.
11. Roots e filhos sao ordenados por timestamp.
12. Um wrapper `TRACE` ainda existe no modelo para agregacao, mas a UI pula esse
    wrapper e renderiza diretamente os root spans.

Por isso, a primeira linha visivel no painel e o root span real.

## Selecao de node

Tipo principal: `TraceWaterfallNodeSelection`.

Quando uma linha visivel de log/span e clicada, o painel envia:

```ts
{
  kind: "log" | "span",
  nodeId,
  row,
  traceId,
  spanId,
}
```

O painel local tambem atualiza `selectedNodeId`, independente da atualizacao do
painel principal. Isso preserva responsividade mesmo quando a query da row
canonica demora.

## Render visual

Arquivo: `trace-waterfall-panel.tsx`.

O componente renderiza:

- header compacto com `Trace` e id encurtado
- botao de download JSON bruto
- botao de collapse
- campo de search
- arvore de spans/logs
- footer com contadores de spans/logs/unlinked

Decisoes visuais atuais:

- root span usa icone `ListTree`, equivalente ao `TRACE` do Langfuse
- spans usam `MoveHorizontal`, equivalente ao `SPAN` do Langfuse
- logs usam `FileText`
- logs sem span usam `AlertTriangle`
- labels de service name nao aparecem na arvore
- nao ha linha visual `TRACE`
- nao ha aviso visual de truncamento no painel
- selecao usa apenas fundo muted, sem borda ou sombra colorida
- hover/click de linha usa cursor de clique
- as linhas sao continuas e compactas
- conectores sao desenhados com CSS para simular:

```txt
├── root
├── child
│   └── grandchild
└── sibling
```

## Search

O search e local e usa `filterTraceWaterfallTree`.

Campos buscados:

- nome do span
- body do log
- service name
- `spanId`
- `parentSpanId`
- status
- status message

Quando um descendente bate na busca, seus ancestrais sao preservados.

Durante busca, os nos ficam efetivamente expandidos para mostrar os matches.

## Loading e estabilidade visual

O drawer usa `placeholderData: (previousData) => previousData` no query da row
principal. Com isso, ao clicar em outra linha:

- o painel principal nao pisca para preto/vazio
- a row antiga continua visivel enquanto a nova query roda
- um indicador compacto de carregamento aparece no topo do painel principal
- quando a nova row chega, o conteudo troca de forma estavel

O trace query tambem usa `placeholderData`. O waterfall so mostra estado
`loading` no carregamento inicial, quando ainda nao existe dado anterior. Em
refetch com dados antigos, o waterfall permanece renderizado ate o novo resultado
chegar.

## Download

O botao de download exporta JSON bruto:

```ts
{
  traceId,
  traceSourceName,
  logSourceName,
  spans,
  logs,
}
```

Antes de exportar, aliases internos `__loglog_trace_*` sao removidos.

## Estados de UI

`TraceWaterfallPanel` aceita:

- `setup-required`
- `loading`
- `error`
- `empty`
- `ready`

`setup-required` aparece quando a linha tem atributos de trace/span, mas o source
nao tem correlacao configurada ou o trace source apontado nao esta disponivel.

## Regras de implementacao adicionadas

- Nao criar arquivos de `contracts` ou bridge para resolver tipos.
- Nao usar `as any` nem `as unknown`.
- `DataRow` deve continuar no modulo neutro `apps/web/src/lib/data-row.ts`.
- `data-row-side-panel` pode reexportar `DataRow` por compatibilidade, mas nao
  deve ser a fonte canonica do tipo.
- Matching inicial do waterfall deve usar aliases normalizados e helper puro no
  model, nao estado controlado permanente no componente.
- Clique na linha do waterfall popula o painel principal; expand/collapse fica
  somente no chevron.
- Aliases internos `__loglog_row_selector_*` e `__loglog_trace_*` nao devem
  aparecer em `Column Values` nem no download JSON.

## Verificacao realizada

Comandos executados durante a implementacao:

```bash
bun test apps/web/src/components/trace-waterfall/trace-waterfall-model.test.ts apps/web/src/routes/logs/-lib/logs-row-panel.test.ts
bunx biome check apps/web/src/lib/data-row.ts apps/web/src/components/data-row-side-panel apps/web/src/components/trace-waterfall apps/web/src/routes/logs/-lib/logs-row-panel.ts apps/web/src/routes/logs/-lib/logs-row-panel.test.ts
git diff --check
bunx turbo -F web typecheck
```

Resultado:

- testes do builder, resolver de highlight, adapter de row identity e resolucao
  de campos passaram
- Biome focado passou
- `git diff --check` passou
- `bunx turbo -F web typecheck` ainda falha em erros existentes de
  `apps/server/src/features/sources/routes.ts` nas linhas 84, 129 e 182, fora do
  escopo deste painel

Nao foi iniciado `bun dev`, porque o servidor de desenvolvimento ja estava
rodando localmente.

## Pontos para evoluir depois

- virtualizacao da arvore se traces muito grandes ficarem pesados
- acao explicita para carregar trace completo por outro limite
- opcao de mostrar/ocultar logs no waterfall
- suporte simetrico completo para abrir painel a partir de um trace source usando
  `trace.config.logSourceId`
- fluxo futuro estilo HyperDX usando `rowWhere`/`selectedRowKey` dentro do
  proprio waterfall para abrir detalhes internos por identidade SQL
