# Sources Feature

## Objetivo

Sources definem como a aplicacao le eventos observaveis em uma conexao salva. Hoje a API publica gerencia sources dos tipos `log` e `trace`.

O banco possui o enum `source_type` com `trace`, `log` e `metric`, mas a feature publica ainda nao aceita `metric`. Isso e intencional: linhas `metric` eventualmente existentes nao devem ser criadas nem expostas pelos endpoints atuais.

## Arquivos principais

- `apps/server/src/db/models/sources.ts`: model Drizzle da tabela `sources`.
- `apps/server/src/features/sources/base/schemas.ts`: configuracao comum a varios tipos de source.
- `apps/server/src/features/sources/logs/schemas.ts`: configuracao de log source.
- `apps/server/src/features/sources/traces/schemas.ts`: configuracao de trace source.
- `apps/server/src/features/sources/schemas.ts`: schemas publicos da API e tipos derivados.
- `apps/server/src/features/sources/routes.ts`: rotas HTTP/OpenAPI.
- `apps/server/src/features/sources/service.ts`: regras de negocio e validacao por tipo.

## Documentos

- [schemas.md](./schemas.md): contratos Zod, defaults e diferencas entre log/trace.
- [flow.md](./flow.md): fluxo das rotas, create/update/list e exposicao publica.
