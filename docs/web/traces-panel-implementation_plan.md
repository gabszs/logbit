# Trace Visualization in Row Side Panel

This plan outlines the implementation of a Langfuse-inspired Trace Sidebar within the existing `DataRowSidePanel`, using HyperDX's logic to correlate and display spans and logs.

## Proposed Changes

### 1. Extensibilidade do Adapter (`types.ts`)
Para buscar a árvore completa do trace, precisaremos estender o `RowPanelAdapter` para suportar a busca de todos os eventos de um `traceId`.

#### [MODIFY] `apps/web/src/components/data-row-side-panel/types.ts`
- Adicionar `fetchTrace?: (traceId: string, identity: RowIdentity) => Promise<RowPanelQueryResult>` ao `RowPanelAdapter`.

#### [MODIFY] `apps/web/src/routes/logs/-lib/logs-row-panel.ts`
- Implementar `fetchTrace` no `createLogsRowPanelAdapter`, executando uma query semelhante a `SELECT * FROM table WHERE traceId = '...' ORDER BY timestamp ASC LIMIT 10000`.

### 2. Estado de Seleção no Painel Principal

#### [MODIFY] `apps/web/src/components/data-row-side-panel/data-row-side-panel.tsx`
- O `DataRowSidePanel` ou o `SuccessPanel` precisará manter um estado `selectedNode: DataRow | null`.
- Inicialmente, `selectedNode` será a linha original clicada na tabela (`rows[0]`).
- A prop `row` passada para `RowHeader`, `BodyBlock` e `ColumnValuesSection` passará a ser esse `selectedNode`.
- O painel passará a usar um layout `flex-row` para acomodar a nova aba lateral na esquerda.

### 3. Nova Aba Lateral de Trace (Trace Sidebar)

#### [NEW] `apps/web/src/components/data-row-side-panel/trace-sidebar.tsx`
- Componente renderizado à esquerda do conteúdo principal.
- Visível apenas se `selectedNode` (ou a linha raiz) possuir um `traceId` válido.
- Terá um header com: Search icon (filtro local), Download icon e Toggle Collapse icon.
- Será expansível/colapsável (default: expandido).

#### [NEW] Redimensionamento da Aba Lateral
- O painel lateral principal continuará ocupando no máximo `70vw` da tela (comportamento atual do `SheetContent`).
- A aba de Trace (`trace-sidebar.tsx`) terá uma largura dinâmica baseada em seu conteúdo.
- No entanto, ela terá uma restrição estrita: ocupará no máximo **25% do espaço do painel lateral principal** (ou seja, `max-w-[25%]`).
- Se o conteúdo da árvore de trace for curto, a aba deve encolher (usando `w-auto` ou `min-w-fit`, com truncamento adequado para conteúdos muito longos que estourem o limite de 25%).

#### [NEW] `apps/web/src/components/data-row-side-panel/trace-tree.tsx`
- Responsável por montar a árvore/DAG.
- **Lógica (HyperDX)**:
  - Agrupa as linhas (`DataRow[]` recebido do `fetchTrace`).
  - Reconstrói a árvore usando `spanId` e `parentSpanId`.
  - Linhas identificadas como "logs" que possuam um `spanId` serão anexadas como filhos ("folhas") do respectivo span.
  - Ordenação cronológica baseada no timestamp.
- **Renderização (Langfuse)**:
  - Lista plana renderizada em profundidade (DFS) calculando o nível de indentação.
  - Ícones diferentes para Spans (barras/linhas de tempo simples) e Logs (ícone de log sem duração).
  - Clicar em um nó dispara o `setSelectedNode(node)`.

## Open Questions

> [!IMPORTANT]
> Preciso que você esclareça os seguintes pontos antes de prosseguirmos com a execução:

1. **Diferenciação Log vs Span**: Na sua tabela atual do ClickHouse, como distinguimos exatamente um "log" de um "span" quando ambos estão no mesmo resultado da query e compartilham um `traceId`? (ex: Presença de `SpanKind`, falta de `duration`, nome de tabela?).
2. **Identificação de Parentesco**: Devemos assumir que o campo `parentSpanId` ou `ParentSpanId` sempre estará presente nos dados brutos se o nó for filho de outro? Existe algum "fallback" esperado se a coluna se chamar diferente?
3. **Query de Trace**: Para o `fetchTrace`, posso simplesmente executar uma query `SELECT * FROM <database>.<table> WHERE <traceIdField> = '<traceId>' ORDER BY <timestampField> ASC LIMIT 5000` usando os mesmos campos da source configurada?

## Verification Plan

### Manual Verification
1. Abrir o painel clicando em uma linha com `traceId`.
2. Verificar se a aba lateral carrega e exibe a árvore de spans/logs corretamente indentada.
3. Clicar em um "log" na árvore e verificar se o painel principal exibe `Log Values` e o Body.
4. Clicar em um "span" na árvore e verificar se o painel principal exibe `Span Values` e o SpanName.
5. Colapsar e expandir a aba lateral.
6. Testar linhas *sem* `traceId` para garantir que a aba lateral não apareça.
