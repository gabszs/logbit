# Hono routing and typing

This server relies on Hono RPC route inference from `AppType`, exported by
`apps/server/src/index.ts`. Hono's type inference is structural and follows the
value returned by chained route methods. If a route is registered later with a
separate statement, it can exist at runtime without becoming part of the
exported Hono RPC contract.

## Rule

Keep Hono route registration in the functional chain that produces the exported
router value.

```ts
// Good: the route is part of typeof app.
const app = new OpenAPIHono<AppContextType>().get("/health", handler);

// Avoid for Hono RPC contracts: the route works at runtime, but the variable's
// inferred type was already fixed before this statement.
const app = new OpenAPIHono<AppContextType>();
app.get("/health", handler);
```

For feature routers that need middleware-provided variables, use the local
pattern:

```ts
const featureRouter = $(
	new OpenAPIHono<FeatureContext>().use(featureContextMiddleware),
)
	.openapi(routeA, handlerA)
	.openapi(routeB, handlerB);
```

This keeps both requirements together: the handler sees the middleware variables
in `c.get(...)`, and the mounted router contributes concrete route keys to
`AppType`.

## Current app chain

`apps/server/src/index.ts` composes the REST app in this order:

1. `cors(...)` for all requests.
2. `compress()` for all requests.
3. `httpInstrumentationMiddleware(...)` on `*`.
4. `injectOtelTraceHeader` for all requests.
5. Conditional rate limiter on `${apiPrefix}/v1/*`.
6. `authenticateSession` on `${apiPrefix}/v1/*`.
7. `authRouter` mounted at `${apiPrefix}/v1`.
8. `connectionsRouter` mounted at `${apiPrefix}/v1`.
9. `proxyRouter` mounted at `${apiPrefix}/v1`.
10. `sourcesRouter` mounted at `${apiPrefix}/v1`.
11. `utilityRoutes` mounted at `${apiPrefix}/`.
12. `problemDetailsHandler(...)` as the app error handler.

`apiPrefix` is a literal union:

- `""` when `SERVE_STATIC=false`.
- `"/api"` when `SERVE_STATIC=true`.

Keep it as a literal union. Widening it to plain `string` makes Hono RPC route
keys less precise.

## Authentication boundary

`authenticateSession` runs on every `${apiPrefix}/v1/*` request. It skips the
Better Auth subtree by checking the runtime path against:

```ts
`${settings.SERVE_STATIC ? "/api" : ""}${settings.AUTH_BASE_PATH}`
```

With the default `AUTH_BASE_PATH="/v1/auth"`, the public auth subtree is:

- `/v1/auth/*` when `SERVE_STATIC=false`.
- `/api/v1/auth/*` when `SERVE_STATIC=true`.

All other mounted REST v1 routers depend on `authenticateSession` setting:

- `user`
- `session`

Routers such as connections, sources, and proxy add their own feature context
middleware after authentication. Those middlewares read `session`, require
`session.activeOrganizationId`, and then set:

- `service`
- `activeOrganizationId`

## Mounted routes

These paths are shown without `apiPrefix` unless noted.

| Mount | Router | Runtime paths | Auth/session |
| --- | --- | --- | --- |
| `/v1` | `authRouter` | `/v1/auth/*` for `GET` and `POST` | Public inside `authenticateSession` skip |
| `/v1` | `connectionsRouter` | `POST /v1/connections/ping`, `POST /v1/connections/query-test`, `GET /v1/connections/{id}`, `GET /v1/connections`, `POST /v1/connections`, `PATCH /v1/connections/{id}`, `DELETE /v1/connections/{id}` | Requires session and active organization |
| `/v1` | `proxyRouter` | `ALL /v1/proxy/connections/:connectionId`, `ALL /v1/proxy/connections/:connectionId/*` | Requires session and active organization |
| `/v1` | `sourcesRouter` | `GET /v1/sources/{id}`, `GET /v1/sources`, `POST /v1/sources`, `PATCH /v1/sources/{id}`, `DELETE /v1/sources/{id}` | Requires session and active organization |
| `/` | `utilityRoutes` | `GET /health`, `GET /setup` | Outside `/v1/*`; no session middleware |
| `/orpc/*` | `RPCHandler(OrpcRouter)` | oRPC procedures under `profile.*` and `settings.*` | Enforced by oRPC `protectedProcedure`, not Hono `authenticateSession` |

When `SERVE_STATIC=true`, prepend `/api` to these API paths. Static assets and
SPA fallback remain outside that prefix.

## Routes registered outside the typed chain

The following routes are registered after the `const app = ...` chain in
`index.ts`. They are intentional runtime routes, but they should not be treated
as Hono RPC contract routes unless they are moved into the chain and the type is
verified:

- `${apiPrefix}/orpc/*`
- OpenAPI docs from `setupOpenApi(app, apiPrefix)` when `ENABLE_OPEN_API=true`
- static assets and SPA fallback when `SERVE_STATIC=true`

ORPC has its own exported contract:

- `AppRouter`
- `RouterOutputs`
- `RouterInputs`

Do not try to access ORPC procedures through `honoClient`; use the ORPC client.

## Adding or moving routes

Use this checklist when changing server routes:

1. Add feature routes to the exported feature router chain, not as later
   mutations.
2. Mount feature routers in the top-level `app` chain before `.onError(...)`.
3. Put public routes outside the `/v1/*` authenticated subtree, or explicitly
   update `authenticateSession`'s skip rule.
4. Put active-organization routes behind a feature context middleware that
   requires `session.activeOrganizationId`.
5. If the frontend should call a route with `honoClient`, verify it appears in
   `AppType`; do not cast the frontend client to paper over a missing route.

