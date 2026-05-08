# Sources Page

## Objetivo

A pagina `/integrations/sources` permite gerenciar como a organizacao le logs e traces a partir de conexoes ClickHouse salvas.

Arquivos principais:

- `apps/web/src/routes/integrations/sources.tsx`: pagina, loader, queries e paginacao.
- `apps/web/src/routes/integrations/-components/add-source-dialog.tsx`: create/edit de source.
- `apps/web/src/routes/integrations/-components/source-row.tsx`: linha expansivel, detalhes, edit/delete.
- `apps/web/src/routes/integrations/-lib/source-api.ts`: chamadas HTTP usadas pela pagina.
- `apps/web/src/lib/sources.ts`: hidrata respostas e exporta tipos derivados dos schemas do server.

## Tipos suportados

A UI suporta:

- `Log`
- `Trace`

`Metrics` permanece indisponivel no dialog. O backend tambem nao aceita criar metric source pela API publica.

## Documentos

- [flow.md](./flow.md): fluxo da pagina, dialog, payload e correlacoes.
