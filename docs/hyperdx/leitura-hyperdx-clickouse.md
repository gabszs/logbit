# HyperDX - analise da leitura de logs no ClickHouse com schema JSON

## Paths relevantes
- `otel/hyperdx/docker/otel-collector/schema/seed/00002_otel_logs.sql`
- `otel/hyperdx/packages/api/.env.development`
- `otel/hyperdx/packages/common-utils/src/clickhouse/index.ts`
- `otel/hyperdx/packages/common-utils/src/queryParser.ts`
- `otel/hyperdx/packages/common-utils/src/core/metadata.ts`
- `otel/hyperdx/packages/common-utils/src/core/renderChartConfig.ts`
- `otel/hyperdx/packages/common-utils/src/core/utils.ts`
- `otel/hyperdx/packages/app/src/hooks/useMetadata.tsx`
- `otel/hyperdx/packages/app/src/hooks/useFieldExpressionGenerator.tsx`
- `otel/hyperdx/packages/app/src/components/DBRowJsonViewer.tsx`
- `otel/hyperdx/packages/app/src/components/DBRowOverviewPanel.tsx`
- `otel/hyperdx/packages/app/src/components/DBRowDataPanel.tsx`
- `otel/hyperdx/packages/app/src/components/DBSearchPageFilters.tsx`
- `otel/hyperdx/packages/cli/src/api/eventQuery.ts`
- `otel/hyperdx/packages/cli/src/shared/rowDataPanel.ts`
- `otel/hyperdx/packages/cli/src/components/RowOverview.tsx`

## Escopo
Esta analise foca em como o HyperDX le queries de logs no ClickHouse, com atencao ao impacto de um schema novo em JSON.

## Resumo executivo
O codigo ja tem suporte parcial a JSON, mas o fluxo principal ainda esta muito acoplado ao schema antigo baseado em `Map(...)`.
Na pratica:
- o parser de query ja entende colunas `JSON`;
- a UI ja sabe exibir e navegar campos JSON em alguns pontos;
- porem a descoberta de chaves JSON esta desabilitada;
- e o schema local de logs ainda e definido com `Map`, nao `JSON`.

Isso significa que o sistema esta meio pronto para schema JSON, mas ainda nao esta alinhado de ponta a ponta.

## O que o schema atual mostra
Em `docker/otel-collector/schema/seed/00002_otel_logs.sql`, a tabela `otel_logs` ainda define:
- `ResourceAttributes Map(...)`
- `ScopeAttributes Map(...)`
- `LogAttributes Map(...)`

Ou seja, o schema base de logs ainda nao esta em JSON puro.

No mesmo sentido, o bootstrap local em `packages/api/.env.development` aponta a source de logs para:
- `eventAttributesExpression = "LogAttributes"`
- `resourceAttributesExpression = "ResourceAttributes"`
- `implicitColumnExpression = "Body"`

## Como a leitura de logs funciona hoje
A geracao de SQL passa por `packages/common-utils/src/queryParser.ts`.
Esse arquivo ja tem suporte explicito para:
- colunas `Map`
- colunas `JSON`
- arrays de mapas/JSON
- comparacao por tipo numerico, bool e string

O ponto central e `buildColumnExpressionFromField()`:
- se a coluna e `Map`, usa acesso com `??[?]`
- se a coluna e `JSON`, usa `toString(??)` e `dynamicType(??)` para decidir a forma de leitura
- se a coluna e `String`, usa `JSONExtractString(...)` para paths aninhados

Ou seja, o motor de query ja sabe ler schema JSON.

## Onde o JSON ainda quebra ou fica incompleto
Em `packages/common-utils/src/core/metadata.ts`, a funcao `getJSONKeys()` esta desabilitada com retorno vazio.
Isso afeta:
- autocomplete de campos JSON
- filtros por paths JSON
- descoberta dinamica de chaves no painel

Esse e hoje o maior bloqueio pratico para operar com schema JSON de forma completa.

## Impacto na UI
A UI ja tem partes preparadas:
- `useMetadata.tsx` filtra colunas JSON pelo tipo `JSON`
- `DBRowJsonViewer.tsx` monta expressoes SQL para acessar paths JSON
- `DBRowOverviewPanel.tsx` ja trata `resourceAttributesExpression` como JSON ou Map
- `DBRowDataPanel.tsx` normaliza campos para exibicao
- `DBSearchPageFilters.tsx` inclui subcampos Map/JSON em algumas listas

Mas a experiencia depende fortemente de metadata correta vinda do ClickHouse.

## Impacto no CLI
O CLI usa a mesma base de geracao de query:
- `packages/cli/src/api/eventQuery.ts`
- `packages/cli/src/shared/rowDataPanel.ts`
- `packages/cli/src/components/RowOverview.tsx`

Entao qualquer mudanca de schema no ClickHouse precisa ser refletida nas expressoes da source, senao a leitura no terminal tambem quebra.

## Leitura pratica do estado atual
Hoje o sistema esta assim:
- leitura por Map: madura e consistente
- leitura por JSON: parcialmente suportada
- descoberta de JSON: desativada
- schema local de logs: ainda Map

Entao, se o novo schema ja estiver chegando em JSON, o principal risco nao e o SQL em si, e sim o alinhamento entre:
- schema real no ClickHouse
- source config
- metadata
- descoberta de paths JSON
- componentes de UI/CLI

## Riscos principais
1. Campos JSON novos nao aparecerem nos filtros.
2. Paths aninhados serem lidos em uma parte da UI, mas nao em outra.
3. Queries montadas para Map continuarem sendo emitidas contra colunas JSON.
4. A fonte de logs continuar apontando para nomes de colunas antigos.

## Conclusao
O HyperDX ja tem base tecnica para ler logs em schema JSON no ClickHouse, mas a implementacao ainda esta incompleta.
O ponto mais critico a revisar e a camada de metadata, porque ela e o que liga o schema real ao gerador de query.
Sem isso, o suporte JSON fica funcional so em partes isoladas.
