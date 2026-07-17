# Server architecture

This document maps `apps/server/src` as it exists today. It complements
`docs/internal/server/hono-routing-and-typing.md`, which focuses specifically on
Hono route typing and middleware order.

## Big picture

The server is a Bun/Hono API with two request surfaces:

- Hono REST/OpenAPI routes, exported through `AppType` for `honoClient`.
- oRPC procedures, exported through `AppRouter`, `RouterOutputs`, and
  `RouterInputs`.

The dominant flow for REST features is:

```txt
index.ts
  -> feature/routes.ts
    -> feature context middleware
      -> feature/service.ts
        -> feature/repository.ts
          -> db/models/*
          -> db/index.ts
```

The dominant flow for oRPC features is:

```txt
index.ts
  -> RPCHandler(OrpcRouter)
    -> lib/orpc.ts createContext()
      -> features/profile/routes.ts
      -> features/settings/routes.ts
```

## Entry and composition

`src/index.ts` is the runtime entrypoint and composition root.

It is responsible for:

- running Drizzle migrations at startup;
- creating the top-level `OpenAPIHono<AppContextType>`;
- installing global middleware: CORS, compression, HTTP instrumentation, trace
  response header, rate limit, session auth;
- mounting REST feature routers;
- wiring the oRPC handler;
- installing OpenAPI docs and static serving conditionally;
- exporting `app`, `AppType`, and Bun's default `{ port, fetch }`.

Keep route registration chained in the exported Hono app/router expression. See
`hono-routing-and-typing.md` for the reason.

## Folder roles

### `common`

Shared building blocks for feature modules.

- `common/schemas/baseSchemas.ts`: cross-feature Zod schemas for pagination,
  ordering, UUID params, auth headers, upload responses, and validation error
  shapes.
- `common/repository/IRepository.ts`: generic repository contract used by base
  services.
- `common/repository/baseSqlRepository.ts`: Drizzle-backed CRUD base class for
  Postgres tables. It centralizes:
  - `getAll`, `getById`, `create`, `update`, `delete`, `count`;
  - date range filtering;
  - simple equality filters;
  - ordering;
  - pagination and `page_size="all"`.
- `common/services/baseService.ts`: thin generic service wrapper around an
  `IRepository`.
- `common/utils.ts`: small shared helpers such as `checkForChanges` and SQL
  datetime conversion.

Use `common` only for patterns that are truly shared across features. Feature
rules should stay in feature services.

### `db`

Persistence setup and schema.

- `db/index.ts` creates default database clients:
  - `db`: Drizzle over Bun SQL/Postgres for application state.
  - `pgClient`: raw Bun SQL client used by Drizzle and shutdown.
  - `chDb`: Kysely ClickHouse client for analytical/query workloads.
- `db/models/*`: Drizzle Postgres table models.
- `db/migrations/*`: generated SQL migrations and Drizzle metadata.
- `db/clickhouse/*`: generated/typed ClickHouse schema helpers and Kysely
  function wrappers.

Postgres is the source of truth for app metadata: users, sessions,
organizations, connections, sources, and user settings. ClickHouse is the
analytics backend that sources point at through saved connections.

Current model groups:

- `authModels.ts`: Better Auth tables plus organization, member, invitation,
  API key, and two-factor tables.
- `connections.ts`: saved external connection credentials/config, scoped to
  organization.
- `sources.ts`: logical data sources, scoped to organization, attached to a
  connection.
- `userSettings.ts`: one settings row per user.
- `contactPoints.ts`: alert/contact-point model draft. It is not currently
  exported from `db/models/index.ts` and is not used elsewhere.

`db/models/index.ts` exports the schema object consumed by Drizzle and Better
Auth. If a table should be part of the normal app schema, it must be exported
there.

### `features`

Feature modules own user-facing behavior. REST features generally use:

```txt
schemas.ts      HTTP/OpenAPI and domain DTO schemas
repository.ts   Drizzle repository, usually extending BaseSqlRepository
service.ts      domain/application rules
routes.ts       Hono/OpenAPI transport
```

Current features:

- `auth`: Better Auth Hono bridge. Delegates `/auth/*` to `auth.handler`.
- `connections`: CRUD for saved integration connections and ClickHouse
  connection tests.
- `sources`: CRUD for log/trace source definitions that point at ClickHouse
  connections.
- `proxy`: authenticated ClickHouse HTTP proxy for the browser SDK.
- `profile`: oRPC profile/session procedures.
- `settings`: oRPC user settings procedures.
- `utils`: public health/setup Hono endpoints.
- `opamp`: protobuf OpAMP endpoint and planning files. The router exists but is
  not mounted in `src/index.ts` today.

Cross-feature dependencies should stay intentional. Today:

- `sources` depends on `connections` to ensure a source references a connection
  from the same organization.
- `proxy` depends on `connections` to resolve a saved ClickHouse config.

### `integrations`

Provider-specific external client and config code.

- `integrations/registry.ts` defines supported connection kinds, config schemas,
  discriminated config types, and parse helpers.
- `integrations/factory.ts` creates provider clients from parsed connection
  input.
- `integrations/clickhouse/*`, `cloudflare/*`, `resend/*` own each provider's
  schema and client constructor.

The registry is intentionally connected to `db/models/connections.ts`:
`supportedIntegrationTypes` defines the Postgres enum for connection type. When
adding an integration, update the registry/schema/factory path and generate a
migration for the enum/model impact.

### `lib`

Cross-cutting adapters and infrastructure.

- `auth.ts`: Better Auth configuration and auth factory.
- `cache.ts`: Bun Redis client and a `hono-rate-limiter` store implementation.
- `constants.ts`: content-type constants and OpenAPI response builders.
- `email.ts`: HTML email render helpers.
- `errors.ts`: Problem Details error factory helpers.
- `middleware.ts`: Hono middlewares for session auth and content-type checks.
- `openapi.ts`: Scalar docs setup plus Better Auth OpenAPI schema registration.
- `orpc.ts`: oRPC context factory and public/protected procedure builders.
- `telemetry.ts`: OpenTelemetry log helpers, trace response header middleware,
  optional request attribute middleware, and method instrumentation decorator.

Keep provider/domain-specific logic out of `lib`. `lib` should adapt external
libraries or provide infrastructure used by multiple features.

### `proto`

Protocol Buffer definitions and generated TypeScript for OpAMP.

- `proto/opamp.proto`, `proto/anyvalue.proto`: source proto definitions.
- `proto/gen/*`: generated code from `bun -F server proto:gen`.

## Auth architecture

`lib/auth.ts` is a factory around Better Auth:

- uses `drizzleAdapter(db, { provider: "pg", schema: models })`;
- generates UUIDv7 IDs through Bun;
- enables email/password auth with Bun password hashing;
- optionally uses Redis as Better Auth secondary storage;
- enables Better Auth plugins: API keys, admin, organization, two-factor,
  OpenAPI, and test utils in test mode;
- restricts signup by `AUTH_ALLOWED_EMAIL_DOMAINS` when configured;
- prevents public signup after the first user exists;
- makes the first user a platform admin, creates a default organization, creates
  owner membership, and creates `userSettings`;
- blocks delete-user at the Better Auth hook level when disabled.

Session auth for Hono REST lives in `lib/middleware.ts`, not in `auth.ts`.
`authenticateSession` calls `auth.api.getSession`, skips the auth subtree, and
sets these Hono variables:

- `user`
- `session`

Organization-scoped REST features then add their own middleware to require
`session.activeOrganizationId` and set:

- `activeOrganizationId`
- a feature `service`

oRPC does not use that Hono middleware. It builds context in `lib/orpc.ts` and
enforces authentication with `protectedProcedure`.

## Data model and tenancy

Organization is the main tenancy boundary.

- `connections.organizationId` scopes saved external credentials/config.
- `sources.organizationId` scopes source definitions.
- `sources.connectionId` must point to a connection in the same organization.
- `sessions.activeOrganizationId` supplies the currently selected organization.
- `userSettings.organizationId`, `sourceId`, and `connectionId` store user UI
  preferences/default selections.

Feature services enforce organization ownership by passing
`{ organizationId: activeOrganizationId }` filters to repositories before reads,
updates, and deletes.

## Connections and integrations

Connections are saved external system configs. Supported kinds currently are:

- `clickhouse`
- `cloudflare`
- `resend`

The `connections` feature validates create input with a discriminated union over
`type`, stores the typed config JSONB, and normalizes ClickHouse config.

ClickHouse has two special flows:

- `ConnectionService.testClickhousePing/query` tests raw credentials without
  saving them.
- `features/proxy` resolves a saved ClickHouse connection and forwards SDK HTTP
  traffic to the upstream ClickHouse host, replacing auth/database headers with
  the saved config and blocking unsafe hop-by-hop headers.

## Sources

Sources describe how Loglog should read observability data from a connection.
They are not the raw ClickHouse tables themselves; they are typed configuration
records that say which table/columns/default queries should be used.

Supported source kinds in the API are currently:

- `log`
- `trace`

`db/models/sources.ts` has a `metric` enum value, but the Zod API schemas only
accept `log` and `trace` today. Treat metric as reserved until the feature
schema/service supports it.

Source config is layered:

- `features/sources/base/schemas.ts`: shared source config fields.
- `features/sources/logs/schemas.ts`: log-specific fields and patch schema.
- `features/sources/traces/schemas.ts`: trace-specific fields and patch schema.
- `features/sources/schemas.ts`: top-level discriminated source schemas and
  response wrappers.

Sources currently allow only ClickHouse connections.

## Active versus prepared modules

Active in the top-level app:

- `auth`
- `connections`
- `proxy`
- `sources`
- `utils`
- oRPC `profile`
- oRPC `settings`

Present but not mounted/fully integrated:

- `features/opamp`: router exists, uses protobuf, and has a planning document,
  but it is not mounted in `index.ts`.
- `db/models/contactPoints.ts`: table model exists, but it is not exported from
  `db/models/index.ts` and has no feature routes/services.
- `integrations/factory.ts`: provider client factory exists, but current
  connection flows mostly parse config directly and create ClickHouse clients in
  feature code.

## Architecture observations

These are not necessarily defects, but they are useful landmarks when changing
the server:

- `db/index.ts` reads `DATABASE_URL` from settings for Postgres, but the default
  `chDb` ClickHouse client currently uses a hard-coded URL/credentials. Most
  user-facing ClickHouse access goes through saved `connections`, so check the
  intended role of `chDb` before expanding it.
- `source_type` includes `metric` at the database enum level, while API schemas
  expose only `log` and `trace`.
- `contactPoints` looks like a future alerting/notification model; because it
  is not exported from `models`, it is outside the active Drizzle schema object
  used by the app.
- `opamp` has protobuf route code and generated proto types, but no mount in
  the main app chain.
- `integrations/factory.ts` is the natural home for provider client creation,
  but the current ClickHouse ping/query tests instantiate the ClickHouse client
  directly in `ConnectionService`.
- `lib/filters.ts` is currently empty.

## Adding a new REST feature

Preferred shape:

1. Add or update Drizzle models in `db/models/*` and export from
   `db/models/index.ts`.
2. Generate a migration.
3. Add feature `schemas.ts` from Drizzle select schemas plus explicit request
   and response schemas.
4. Add `repository.ts` extending `BaseSqlRepository` when CRUD fits.
5. Add `service.ts` for organization checks, cross-entity validation, config
   parsing, and domain errors.
6. Add `routes.ts` as a chained `OpenAPIHono` router.
7. Mount the router in the top-level `index.ts` chain.
8. If frontend uses Hono RPC, verify the route appears through `AppType`.

## Adding a new integration type

1. Add provider config schema under `integrations/<provider>/schemas.ts`.
2. Add provider client constructor under `integrations/<provider>/index.ts`.
3. Register it in `integrations/registry.ts`.
4. Update `integrations/factory.ts`.
5. Update connection schemas if the generic registry shape is not enough.
6. Generate a migration if the `connection_type` enum changes.
7. Add service behavior for provider-specific normalization or tests.
