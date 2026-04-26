# /dex Plan: Frontend Logs Explorer

## Goal
Implementar uma nova página `/logs` para leitura de logs no ClickHouse, usando `sources` do tipo `log`, proxy ClickHouse existente e componentes reutilizáveis inspirados no print. V1 sem `Save`, sem `Alerts`, sem filtros laterais, sem patterns; apenas `Results Table`, query controls, período, volumetria e tabela dinâmica.

## Task 1: Preparar Dependências de Visualização
- [ ] Adicionar `@tanstack/react-table`.
- [ ] Adicionar `@tanstack/react-virtual`.
- [ ] Adicionar `recharts`.
- [ ] Rodar `bun install`.
- [ ] Confirmar que `apps/web/package.json` ficou consistente.

## Task 2: Criar Rota `/logs`
- [ ] Criar `apps/web/src/routes/logs/route.tsx`.
- [ ] Aplicar `requireAuthenticated` no `beforeLoad`.
- [ ] Definir `pendingComponent` com skeleton compatível.
- [ ] Definir `errorComponent` amigável.
- [ ] Usar layout full-width operacional, sem card externo gigante.
- [ ] Adicionar item `Logs` no sidebar entre `Home` e `Integrations`.

## Task 3: Criar API Frontend para Sources de Log
- [ ] Criar helper reutilizável para buscar sources.
- [ ] Buscar `/v1/sources` com `page_size=all` e `ordering=name`.
- [ ] Filtrar apenas `source.type === "log"`.
- [ ] Expor `logSourcesQueryOptions`.
- [ ] Evitar `as any` e `as unknown`.
- [ ] Se o `AppType` não cobrir `/v1/sources`, corrigir o contrato em vez de criar cast novo.

## Task 4: Criar Cliente ClickHouse via Proxy
- [ ] Extrair lógica atual de `createProxyClient` de `/integrations/proxy` para helper reutilizável.
- [ ] Criar executor `executeClickhouseJsonQuery`.
- [ ] Tipar retorno como `ClickhouseJsonResult`, com `meta`, `data`, `rows` e `statistics`.
- [ ] Garantir `credentials: "include"` no fetch customizado.
- [ ] Reaproveitar `/v1/proxy/connections/:connectionId`.

## Task 5: Query Builder de Logs
- [ ] Criar `buildLogsTableQuery`.
- [ ] Criar `buildLogsVolumeQuery`.
- [ ] Usar `source.config.database` e `source.config.table`.
- [ ] Usar `source.config.timestampField` para filtro de tempo.
- [ ] Popular `SELECT` com `source.config.defaultSelectQuery`.
- [ ] Popular `ORDER BY` com `source.config.defaultOrderByQuery`.
- [ ] Permitir `WHERE` opcional.
- [ ] Aplicar `LIMIT 500` na tabela.
- [ ] Definir buckets de volumetria por range: `5m/10m = 15s`, `30m/1h = 1m`, `6h/12h = 10m`, `1d = 30m`.

## Task 6: Componentes Reutilizáveis
- [ ] Criar `SourceSelect`.
- [ ] Criar `TimeRangeSelect` com `5m`, `10m`, `30m`, `1h`, `6h`, `12h`, `1d`.
- [ ] Criar `QueryComposer` com `SELECT`, `WHERE`, `ORDER BY` e botão `Run`.
- [ ] Criar `AnalysisModeNav` com apenas `Results Table` ativo e linha colorida.
- [ ] Criar `LogsVolumeChart` com `recharts`.
- [ ] Criar `DynamicResultsTable` com TanStack Table.
- [ ] Adicionar virtualização de rows com TanStack Virtual.
- [ ] Criar estados reutilizáveis: loading, empty e error.

## Task 7: Montar Tela Final
- [ ] Topbar com source selector, campos de query, período e `Run`.
- [ ] Remover `Save` e `Alerts`.
- [ ] Não criar painel lateral de filtros.
- [ ] Colocar `Results Table` no lado esquerdo como modo único.
- [ ] Exibir gráfico de volumetria acima da tabela.
- [ ] Exibir tabela dinâmica abaixo do gráfico.
- [ ] Tabela deve seguir as colunas retornadas pelo `SELECT`.
- [ ] Mostrar métricas de execução: rows, elapsed e bytes read quando disponíveis.

## Task 8: UX e Estados
- [ ] Estado inicial: selecionar primeiro source de log disponível.
- [ ] Se não houver source de log, mostrar empty state com link para `/integrations/sources`.
- [ ] Ao trocar source, atualizar `SELECT` e `ORDER BY`.
- [ ] `Run` deve ficar desabilitado sem source, table/database ou select válido.
- [ ] Erros de ClickHouse devem aparecer em painel legível.
- [ ] Layout deve funcionar em desktop e mobile com scroll horizontal controlado.

## Task 9: Verificação
- [ ] Rodar `bun run --cwd apps/web typecheck`.
- [ ] Rodar `bun run lint` se a implementação tocar muitos arquivos.
- [ ] Testar navegação para `/logs`.
- [ ] Testar source selector com sources `log`.
- [ ] Testar query com período `5m`, `30m` e `1d`.
- [ ] Testar `WHERE` vazio e com condição.
- [ ] Testar `SELECT` alterando colunas.
- [ ] Confirmar gráfico e tabela com dados reais do ClickHouse.

## Defaults
- Range inicial: `15m`.
- Limit inicial da tabela: `500`.
- Analysis mode inicial e único: `Results Table`.
- Caminho de dados v1: proxy ClickHouse existente.
- Escopo v1: logs apenas; traces, metrics, patterns, alerts e saved views ficam para etapas futuras.
