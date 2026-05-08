# Sources Backend Flow

## Entrada comum

Todas as rotas passam por `sourcesContextMiddleware`.

O middleware:

- cria `SourceRepository`
- cria `ConnectionRepository`
- cria `SourceService`
- le `session.activeOrganizationId`
- bloqueia a chamada com `403` quando nao ha organizacao ativa

Todas as operacoes sao escopadas por `organizationId`.

## List

Rota:

```txt
GET /v1/sources
```

Fluxo:

1. Valida query com `searchOptionsSchema`.
2. Busca sources da organizacao ativa pelo service/repository.
3. Converte cada linha com `sourcesSchema.safeParse`.
4. Retorna apenas sources publicas (`log | trace`).

Esse filtro existe porque o model Drizzle conhece o enum completo do banco (`trace`, `log`, `metric`), mas a API publica de sources ainda nao suporta `metric`.

## Get by ID

Rota:

```txt
GET /v1/sources/{id}
```

Fluxo:

1. Valida `id` como UUIDv7.
2. Busca a source dentro da organizacao ativa.
3. Se nao existir, retorna `404`.
4. Faz `sourcesSchema.safeParse`.
5. Se a linha nao for publica, tambem retorna `404`.
6. Retorna a source parseada.

## Create

Rota:

```txt
POST /v1/sources
```

Fluxo:

1. Valida body com `sourcesUpsertSchema`.
2. `SourceService.createSource` valida se `connectionId` pertence a organizacao ativa.
3. A conexao precisa ser do tipo `clickhouse`.
4. O service adiciona `organizationId`.
5. A source e persistida.
6. A resposta e parseada com `sourcesSchema`.

O tipo e decidido pelo discriminador:

- `type: "log"` usa `logsConfigSchema`.
- `type: "trace"` usa `tracesConfigSchema`.

`metric` nao e aceito em create.

## Update

Rota:

```txt
PATCH /v1/sources/{id}
```

Fluxo:

1. Valida `id` como UUIDv7.
2. Valida body com `sourceUpdateSchema`.
3. Busca a source existente na organizacao ativa.
4. Se `connectionId` foi enviado, valida que a nova conexao pertence a organizacao e e `clickhouse`.
5. Se `config` foi enviada, faz merge com a config existente.
6. Valida a config final pelo tipo existente da source:
   - `log` -> `logsConfigSchema`
   - `trace` -> `tracesConfigSchema`
7. Se nada mudou, retorna erro de no changes.
8. Persiste e retorna a source parseada com `sourcesSchema`.

O update nao troca o `type` de uma source. Para mudar de log para trace, crie outra source.

## Delete

Rota:

```txt
DELETE /v1/sources/{id}
```

Fluxo:

1. Valida `id` como UUIDv7.
2. Busca dentro da organizacao ativa.
3. Se nao existir, retorna `404`.
4. Remove a source.
5. Retorna `204`.

## Contratos com Connections

Sources so podem usar conexoes `clickhouse`.

A validacao vive em `SourceService.ensureConnectionBelongsToOrganization` e protege create e update de `connectionId`.

## Public vs DB model

O model em `apps/server/src/db/models/sources.ts` tipa:

```ts
sourceTypeEnum = ["trace", "log", "metric"]
config = LogsConfigType | TracesConfigType
```

A API publica tipa:

```ts
sourcesSchema = logSourceSchema | traceSourceSchema
```

Essa separacao permite manter compatibilidade com o enum ja existente no banco sem prometer suporte a metric no gerenciamento atual.
