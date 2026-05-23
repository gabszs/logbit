# Dashboards

## Modelo de dados

Dashboards sao salvos em `projects.dashboards`.

Campos importantes:

- `id`
- `project_id`
- `created_by`
- `base_template`
- `schema JSONB`
- `title`
- `tags`
- `teams`
- `file_path`
- `file_sha`

Nao existe uma tabela separada `dashboard_widgets`; os widgets ficam dentro do JSON do campo `schema`.

## Formato do dashboard

`src/Models/Projects/Dashboards.hs` define:

- `Dashboard`
- `Variable`
- `Constant`
- `Tab`

O `Dashboard` tem:

- titulo, descricao, preview, icon;
- tags/teams;
- refresh interval;
- time range;
- constants;
- variables;
- tabs;
- widgets.

O JSON usa snake_case via Aeson.

## Templates YAML

Templates ficam em:

`static/public/dashboards/*.yaml`

Eles sao lidos:

- em compile-time via Template Haskell (`readDashboardsFromDirectory`);
- ou em runtime no modo live reload (`readDashboardsFromDisk`).

Ao aplicar/importar dashboard, o YAML vira `Dashboard` Haskell e pode ser salvo no `schema JSONB`.

## Git sync

Migrations adicionam `file_path` e `file_sha`, e existe `src/Models/Projects/GitSync.hs` / `src/Pages/GitSync.hs`. Isso indica que dashboards podem ser sincronizados com repositorio Git, mantendo caminho e hash do arquivo.

## Widgets

`src/Pkg/Components/Widget.hs` define tipos como:

- `logs`
- `timeseries`
- `timeseries_line`
- `timeseries_stat`
- `stat`
- `top_list`
- `distribution`
- `geomap`
- `funnel`
- `tree_map`
- `pie_chart`
- `anomalies`
- `table`
- `traces`
- `flamegraph`
- `service_map`
- `heatmap`
- `group`

Campos de widget incluem:

- `query`
- `sql`
- `queries`
- `layout`
- `dataset`
- `children`
- `alertId`/thresholds/status
- `pngUrl`
- `dbSource`

`dbSource` pode forcar `"postgres"` ou `"timefusion"`. Sem isso, a escolha segue `ENABLE_TIMEFUSION_READS`.

## Como renderiza

O dashboard e renderizado server-side por `src/Pages/Dashboards.hs`:

1. Busca dashboard no banco ou template.
2. Processa variables/constants.
3. Processa widgets eager em paralelo.
4. Popula alert statuses.
5. Popula URLs PNG assinadas.
6. Renderiza HTML com GridStack.
7. Usa HTMX para lazy load de tabs e atualizacoes parciais.

No navegador:

- GridStack gerencia layout/resizing/drag.
- ECharts renderiza graficos.
- HTMX envia updates de widget/order/rename/duplicate.

## Data sources

Nao encontrei um sistema generico de "data sources" externas tipo Grafana. As fontes sao internas:

- logs/spans em `otel_logs_and_spans`;
- metrics em `telemetry.metrics`;
- issues/anomalies em tabelas `apis.*`;
- queries KQL traduzidas para SQL;
- SQL raw seguro com filtro de projeto;
- escolha de storage por query/widget entre Postgres e TimeFusion.

## Variables e constants

Variables podem ser:

- `query`
- `values`

Constants executam uma SQL ou KQL uma vez e disponibilizam o resultado para widgets via placeholders como `{{const-key}}`.

Isso reduz repeticao e evita reexecutar a mesma query em cada widget.

## Otimizacoes

- Processamento concorrente de widgets eager.
- Lazy loading de tabs via HTMX.
- Constants executadas uma vez.
- Dataset pode ser embutido no widget para evitar nova query.
- `rawQuery` preserva template original com placeholders.
- Alert status e PNG URLs populados em batch.
- Queries podem ler de TimeFusion quando habilitado.

## Fontes no codigo

- `src/Models/Projects/Dashboards.hs`
- `src/Pages/Dashboards.hs`
- `src/Pkg/Components/Widget.hs`
- `src/Pages/Charts/Charts.hs`
- `static/public/dashboards/*.yaml`
- `static/migrations/0002_logs_traces_metrics.sql`
- `static/migrations/0020_github_sync.sql`
