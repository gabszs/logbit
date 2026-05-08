# Reusable Row Side Panel

## Objetivo

O Row Side Panel permite clicar em uma linha de dados e abrir um drawer lateral com a linha completa recarregada diretamente da fonte. A primeira aplicacao esta na tela de logs, mas a implementacao foi feita para ser reutilizavel em futuras telas, como traces.

A regra principal e: o panel nao depende das colunas visiveis da tabela. A tabela precisa carregar dados minimos de identidade da linha, montar um `rowWhere`, e o panel faz uma consulta propria para buscar a linha completa.

## Arquitetura

Componentes compartilhados ficam em:

```txt
apps/web/src/components/data-row-side-panel/
```

Arquivos principais:

- `data-row-side-panel.tsx`: shell do drawer, estados de loading, erro, vazio, ambiguo e sucesso.
- `types.ts`: contratos reutilizaveis (`RowIdentity`, `ResolvedRowFields`, `RowPanelAdapter`).
- `row-header.tsx`: cabecalho visual com severidade, timestamp, time ago e service.
- `body-block.tsx`: bloco `Body` com copy dentro do campo.
- `column-values-section.tsx`: secao `Log/trace Values`, busca, unwrap e copy JSON completo.
- `structured-value-tree.tsx`: visualizador expansivel de atributos.
- `value-formatting.ts`: parse, stringify e formatacao de valores.

O adapter de logs fica em:

```txt
apps/web/src/routes/logs/-lib/logs-row-panel.ts
```

A rota de logs integra o panel em:

```txt
apps/web/src/routes/logs/route.tsx
```

## Contratos

`RowIdentity` representa a identidade minima para reconsultar uma linha:

```ts
export type RowIdentity = {
	sourceId: string;
	connectionId: string;
	tableLabel: string;
	rowWhere: string;
	selectedRowKey: string;
	aliasWith?: Array<{
		alias: string;
		expression: string;
	}>;
};
```

Campos importantes:

- `sourceId`: fonte usada pela tela atual.
- `connectionId`: conexao ClickHouse salva, usada com `createProxyClient(connectionId)`.
- `tableLabel`: texto exibido no header do panel.
- `rowWhere`: clausula ClickHouse que identifica a linha.
- `selectedRowKey`: chave estavel para destacar a linha selecionada na tabela.
- `aliasWith`: reservado para casos em que aliases sejam realmente necessarios. No logs v1 fica vazio.

`ResolvedRowFields` e uma camada de resolucao em memoria para a UI:

```ts
export type ResolvedRowFields = {
	timestamp?: unknown;
	traceId?: unknown;
	spanId?: unknown;
	serviceName?: unknown;
	severityText?: unknown;
	severityNumber?: unknown;
	body?: unknown;
};
```

Essa resolucao nao altera a source, nao cria campos no banco e nao vira contrato semantico interno. Ela so traduz a linha completa para placeholders visuais do panel.

`RowPanelAdapter` e o ponto de extensao para logs, traces ou outra tela:

```ts
export type RowPanelAdapter = {
	getQueryKey: (identity: RowIdentity) => readonly unknown[];
	fetchRow: (identity: RowIdentity) => Promise<RowPanelQueryResult>;
	resolveFields: (row: DataRow) => ResolvedRowFields;
	getColumnValues?: (row: DataRow) => DataRow;
	getColumnValuesLabel?: (row: DataRow, fields: ResolvedRowFields) => string;
	formatError?: (error: unknown) => string;
	renderExtraSections?: (row: DataRow) => ReactNode;
};
```

## Fluxo em `/logs`

1. A query principal da tabela adiciona seletores tecnicos ocultos.
2. A tabela esconde esses campos da UI, do CSV e das colunas visiveis.
3. Ao clicar em uma linha, `/logs` monta um `RowIdentity` com `buildLogsRowIdentity`.
4. O drawer abre com esse `RowIdentity`.
5. `DataRowSidePanel` chama `adapter.fetchRow(identity)`.
6. O adapter faz uma nova query no ClickHouse para buscar a linha completa.
7. O resultado deve ter exatamente uma linha.
8. A UI resolve header/body a partir da linha completa e renderiza a secao de valores com label definida pelo adapter.

## Seletores tecnicos

Logs usa aliases tecnicos posicionais:

```txt
__loglog_row_selector_0
__loglog_row_selector_1
...
```

Eles existem apenas para transporte e identidade da linha. Nao sao usados como contrato visual do panel.

Os seletores sao derivados das expressoes reais da source, com fallbacks OTEL:

- `timestamp`: source `timestampQueryField`, fallback `Timestamp`.
- `body`: source `bodyField`, fallback `Body`.
- `severityText`: source `severityField`, fallback `SeverityText`.
- `serviceName`: source `serviceNameField`, fallback `ServiceName`.
- `traceId`: source `traceIdField`, fallback `TraceId`.
- `spanId`: source `spanIdField`, fallback `SpanId`.

A tabela principal recebe esses campos por `extraSelectExpressions` em `buildLogsTableQuery`:

```sql
SELECT <selectQuery>, <source expression> AS "__loglog_row_selector_0", ...
FROM <db>.<table>
WHERE ...
ORDER BY ...
LIMIT 500
```

Depois, `DynamicResultsTable` recebe:

- `hiddenColumnKeys`: esconde os aliases tecnicos.
- `getRowKey`: calcula `selectedRowKey`.
- `onRowClick`: abre o panel quando a linha tem identidade valida.
- `selectedRowKey`: aplica highlight visual na linha selecionada.

## `rowWhere`

`rowWhere` e construido com as expressoes originais da source, nao com aliases semanticos artificiais.

Para valores escalares, o predicado atual usa:

```sql
toString(<source expression>) = '<escaped value>'
```

Para valores nulos:

```sql
isNull(<source expression>)
```

Se a linha nao tiver valores suficientes para montar predicados, `buildLogsRowIdentity` retorna `null` e a linha nao abre o panel.

O `selectedRowKey` atual e:

```txt
<sourceId>:<rowWhere>
```

Isso permite manter highlight visual e recarregar o panel ao clicar em outra linha.

## Query de detalhe

O panel sempre refaz a busca da linha completa. Para logs, a query e montada por `buildLogsRowDetailQuery`:

```sql
SELECT *, <source expressions> AS "__loglog_row_selector_*"
FROM "<database>"."<table>"
WHERE <rowWhere>
LIMIT 2
```

Regras:

- Usa sempre `createProxyClient(connectionId)`.
- Usa a tabela configurada na source.
- Nao depende de `selectQuery`, `orderByQuery` ou das colunas visiveis da tabela.
- `LIMIT 2` detecta ambiguidade sem carregar mais dados que o necessario.

Estados do resultado:

- `0 rows`: estado vazio.
- `1 row`: sucesso.
- `2 rows`: identidade ambigua.
- erro: formatado por `formatClickhouseQueryError`.

## Cache e recarregamento

`DataRowSidePanel` usa TanStack Query com:

```ts
staleTime: Number.POSITIVE_INFINITY
gcTime: Number.POSITIVE_INFINITY
refetchOnMount: false
refetchOnReconnect: false
refetchOnWindowFocus: false
```

Isso evita refetch automatico quando o usuario troca de aba, volta o foco ou remonta o componente. O panel so troca de conteudo quando a propria UI troca o `RowIdentity`, por exemplo ao clicar em outra linha.

## UI atual

O drawer usa `Sheet` e ocupa aproximadamente `70vw` em telas maiores.

Header:

- Primeira linha mostra a source/tabela.
- Segunda linha segue o formato `level - timestamp - time ago - service`.
- O badge de severidade e centralizado verticalmente.
- `time ago` usa segundos, minutos ou horas.
- Service aparece com borda.
- Service vazio mostra `no service detected`.
- Copy do service so aparece quando ha service real.

Body:

- Renderiza o bloco `Body`.
- Conteudo longo usa wrap/scroll estavel.
- O botao de copy fica dentro do campo do valor.
- Copy tem feedback visual pelo `CopyButton` compartilhado.

Values:

- E a unica aba/secao extra no v1.
- A label vem do adapter.
- Em logs, a label fica `Log Values`.
- Em spans, a label fica `Span Values`.
- Tem busca por coluna, path ou valor.
- Campo de busca fica a esquerda.
- Botoes ficam alinhados a direita.
- Copy copia o JSON completo da linha original ja sem aliases tecnicos.
- Unwrap alterna renderizacao de valores longos.

Viewer de atributos:

- Renderiza valores como `key: value`.
- Chave tem cor propria.
- Valor tem cor por tipo.
- Objetos e arrays podem expandir/colapsar.
- Quando expandido, objeto/array mostra `key:` no pai e filhos indentados abaixo.
- Quando colapsado, mostra resumo curto como `{3}` ou `[2]`.
- Hover exibe acoes: copy value, copy row e copy object.
- String vazia aparece como `""`.

## Remocao de aliases tecnicos

Antes de renderizar/copiar `Log/trace Values`, o adapter de logs chama `stripTechnicalAliases`.

Isso remove qualquer chave com prefixo:

```txt
__loglog_row_selector_
```

Assim o usuario ve e copia apenas a linha real, sem campos de transporte internos.

## Reuso futuro em traces

Para reutilizar em `/traces`, nao deve haver fork do panel. A nova tela deve criar um adapter proprio que implemente o mesmo contrato:

1. Garantir que a tabela carregue identidade minima da linha.
2. Montar `RowIdentity` com `rowWhere` adequado.
3. Implementar `fetchRow` usando `createProxyClient(connectionId)`.
4. Implementar `resolveFields` para preencher header/body quando fizer sentido.
5. Opcionalmente passar `renderExtraSections` para secoes especificas de traces.
6. Opcionalmente customizar `getColumnValues` para remover aliases tecnicos de transporte.

O componente compartilhado continua ignorando detalhes de logs ou traces. Ele so conhece `RowIdentity`, adapter e a linha completa retornada.

## Limites do v1

Implementado agora:

- Drawer reutilizavel.
- Clique em linha abre panel.
- Query propria para linha completa.
- Highlight da linha selecionada.
- Header, Body e values dinamico (`Log Values` ou `Span Values`).
- Busca, unwrap, copy JSON e viewer estruturado.
- Estados loading, erro, vazio e ambiguo.

Ficou fora de proposito:

- Trace correlation.
- Overview.
- Service map.
- Surrounding context.
- Session replay.
- Nested drawers.
- Filtros por clique.
- Heuristicas HTTP/exception.

## Cuidados para manutencao

- Nao usar aliases semanticos artificiais como contrato interno do panel.
- Usar expressoes reais da source como fonte da verdade.
- Manter aliases tecnicos apenas para transporte/identidade.
- Nao basear o panel nos dados visiveis da tabela.
- Nao usar `selectQuery` da tabela para a query de detalhe.
- Manter `LIMIT 2` para detectar ambiguidade.
- Manter ClickHouse via `createProxyClient(connectionId)`.
- Evitar casts vagos. Se o tipo da linha mudar, ajustar `DataRow`/adapter de forma explicita.

## Validacao

Comando usado para validar a implementacao:

```bash
cd apps/web
bun run typecheck
```

Checklist manual recomendado:

- Clicar em uma linha abre o panel.
- Clicar em outra linha troca o `RowIdentity` e recarrega o detalhe.
- Linha selecionada fica destacada.
- A query do detalhe busca a linha completa.
- JSON copiado nao inclui `__loglog_row_selector_*`.
- Body copia com feedback.
- Busca filtra por key/path/value.
- Objetos expandem e colapsam.
- Objetos aninhados aparecem indentados abaixo como YAML.
- Estados vazio, erro e ambiguo aparecem corretamente.
