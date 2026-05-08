# Trace waterfall side panel

## Objetivo

Este documento registra a implementacao do painel lateral de trace no drawer de
detalhes de uma linha de log.

O painel combina duas referencias:

- visual inspirado no Langfuse: arvore compacta de trace, linhas de hierarquia,
  icones por tipo e duracao por linha
- logica inspirada no HyperDX: spans formam a arvore por `SpanId` e
  `ParentSpanId`; logs entram no mesmo waterfall por `TraceId` e sao pendurados
  no span de mesmo `SpanId`

Nao foi implementado timeline horizontal, graph view ou service map.

## Paths principais

- `apps/web/src/components/data-row-side-panel/data-row-side-panel.tsx`
  - integra o painel de trace dentro do drawer de detalhes
  - renderiza o painel a esquerda quando a linha carregada tem contexto de trace
- `apps/web/src/components/data-row-side-panel/types.ts`
  - define o contrato opcional do adapter para trace
  - inclui `RowTracePanelDescriptor` e `RowTracePanelQueryResult`
- `apps/web/src/components/trace-waterfall/trace-waterfall-panel.tsx`
  - componente visual reutilizavel do painel
  - controla busca, collapse, download JSON e render da arvore
- `apps/web/src/components/trace-waterfall/trace-waterfall-model.ts`
  - builder puro da arvore
  - normaliza spans/logs, ordena, monta hierarquia e filtra busca
- `apps/web/src/components/trace-waterfall/trace-waterfall-model.test.ts`
  - testes unitarios do builder
- `apps/web/src/routes/logs/-lib/logs-row-panel.ts`
  - implementa a correlacao log -> trace source
  - monta queries ClickHouse para spans e logs
- `apps/web/src/routes/logs/route.tsx`
  - carrega todos os sources para resolver `traceSourceId`
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

Estados possiveis:

- sem `TraceId` e sem `SpanId`: nao renderiza painel
- tem attrs de trace/span, mas nao tem source correlacionado: renderiza estado de
  setup
- tem `traceSourceId` valido e `TraceId`: busca trace

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

## Query ClickHouse

As queries nao usam janela temporal.

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

## Verificacao realizada

Comandos executados durante a implementacao:

```bash
bun test apps/web/src/components/trace-waterfall/trace-waterfall-model.test.ts
bunx biome check apps/web/src/components/trace-waterfall apps/web/src/components/data-row-side-panel apps/web/src/routes/logs/-lib/logs-row-panel.ts apps/web/src/routes/logs/route.tsx apps/web/.env.example
git diff --check
bun run build # em apps/web
```

Resultado:

- testes do builder passaram
- Biome focado passou
- `git diff --check` passou
- build do web passou

Observacao: `bun run typecheck` em `apps/web` foi tentado anteriormente e falhou
em erros existentes de `apps/server/src/features/sources/routes.ts`, fora do
escopo deste painel.

Nao foi iniciado `bun dev`, porque o servidor de desenvolvimento ja estava
rodando localmente.

## Pontos para evoluir depois

- click em span/log abrir detalhe proprio no painel direito
- virtualizacao da arvore se traces muito grandes ficarem pesados
- acao explicita para carregar trace completo por outro limite
- opcao de mostrar/ocultar logs no waterfall
- suporte simetrico completo para abrir painel a partir de um trace source usando
  `trace.config.logSourceId`
