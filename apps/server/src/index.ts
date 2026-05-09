import { httpInstrumentationMiddleware } from "@hono/otel";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { serveStatic } from "hono/bun";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { showRoutes } from "hono/dev";
import { HTTPException } from "hono/http-exception";
import { problemDetailsHandler } from "hono-problem-details";
import { MemoryStore, rateLimiter } from "hono-rate-limiter";
import { db, pgClient } from "./db";
import { settings } from "./env";
import authRouter from "./features/auth/routes";
import connectionsRouter from "./features/connections/routes";
import { profileRouter } from "./features/profile/routes";
import proxyRouter from "./features/proxy/routes";
import { settingsRouter } from "./features/settings/routes";
import sourcesRouter from "./features/sources/routes";
import utilityRoutes from "./features/utils/routes";
import { BunRedisStore, redis } from "./lib/cache";
import { authenticateSession } from "./lib/middleware";
import { setupOpenApi } from "./lib/openapi";
import { createContext } from "./lib/orpc";
import { injectOtelTraceHeader, logger } from "./lib/telemetry";
import type { AppContextType } from "./types";

// RUN MIGRATIONS
await migrate(db, { migrationsFolder: "./src/db/migrations" });

// Keep the prefix as a literal union so Hono RPC can infer concrete route keys.
const apiPrefix: "" | "/api" = settings.SERVE_STATIC ? "/api" : "";
const instrumentationConfig = {
	serviceName: settings.OTEL_SERVICE_NAME,
	serviceVersion: settings.OTEL_SERVICE_VERSION,
	captureRequestHeaders:
		settings.OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER,
};

const rateLimitMiddleware = settings.RATE_LIMIT_ENABLED
	? [
			rateLimiter<AppContextType>({
				standardHeaders: settings.RATE_LIMIT_HEADERS,
				windowMs: settings.RATE_LIMIT_WINDOW_SECONDS * 1000,
				limit: settings.RATE_LIMIT_MAX_REQUESTS,
				keyGenerator: (c) =>
					c.req.header("x-client-ip") ||
					c.req.header("cf-connecting-ip") ||
					c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
					"",
				store: settings.REDIS_URL
					? new BunRedisStore<AppContextType>(
							settings.RATE_LIMIT_PREFIX,
							settings.RATE_LIMIT_SLIDING_WINDOW,
						)
					: new MemoryStore<AppContextType>(),
			}),
		]
	: [];

const app = new OpenAPIHono<AppContextType>()
	.use(
		cors({
			origin: settings.CORS_ORIGIN,
			allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"traceparent",
				"tracestate",
				"baggage",
				"x-client-ip",
				"cf-connecting-ip",
				"x-forwarded-for",
				// ClickHouse HTTP protocol headers (used by @clickhouse/client-web)
				"X-ClickHouse-User",
				"X-ClickHouse-Key",
				"X-ClickHouse-Database",
				"X-ClickHouse-Format",
				"X-ClickHouse-Query-Id",
				"X-ClickHouse-Progress",
				"X-ClickHouse-Summary",
			],
			maxAge: 86400, // 24 hours
			credentials: true,
		}),
	)
	.use(compress())
	.use("*", httpInstrumentationMiddleware(instrumentationConfig))
	.use(injectOtelTraceHeader)
	.use(`${apiPrefix}/v1/*`, ...rateLimitMiddleware)
	.use(`${apiPrefix}/v1/*`, authenticateSession)
	.route(`${apiPrefix}/v1`, authRouter)
	.route(`${apiPrefix}/v1`, connectionsRouter)
	.route(`${apiPrefix}/v1`, proxyRouter)
	.route(`${apiPrefix}/v1`, sourcesRouter)
	.route(`${apiPrefix}/`, utilityRoutes)
	.onError(
		problemDetailsHandler({
			// includeStack: settings.NODE_ENV === "development",
			mapError: (err) => {
				const status = err instanceof HTTPException ? err.status : 500;
				if (status >= 500) console.error(err);
				return undefined;
			},
		}),
	);

// ORPC - Profile routes
type OrpcRouterType = {
	profile: typeof profileRouter;
	settings: typeof settingsRouter;
};

export const OrpcRouter: OrpcRouterType = {
	profile: profileRouter,
	settings: settingsRouter,
};

const rpcHandler = new RPCHandler(OrpcRouter);

export type AppRouter = typeof OrpcRouter;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;

app.use(`${apiPrefix}/orpc/*`, async (c) => {
	try {
		const { matched, response } = await rpcHandler.handle(c.req.raw, {
			prefix: `${apiPrefix}/orpc`,
			context: await createContext({ context: c }),
		});

		if (!matched || !response) {
			return c.notFound();
		}
		return response;
	} catch (error) {
		logger.error(error, { printConsole: true });
		throw error;
	}
});

// docs
if (settings.ENABLE_OPEN_API) {
	// @ts-expect-error
	setupOpenApi<typeof app>(app, apiPrefix);
}

if (settings.SERVE_STATIC) {
	app.use("/assets/*", serveStatic({ root: "./build" }));
	app.use("/favicon.ico", serveStatic({ path: "./build/favicon.ico" }));
	app.get("*", serveStatic({ path: "./build/index.html" }));
}

if (settings.NODE_ENV !== "test") showRoutes(app);

export const shutdownDependencies = async () => {
	await pgClient.close(); // drena conexões ativas e fecha o pool
	redis.close(); // fecha conexão com Redis
	process.exit(0);
};

["SIGTERM", "SIGINT", "beforeExit", "SIGQUIT"].forEach((event) => {
	process.on(event, shutdownDependencies);
});

export { app };
export type AppType = typeof app;
export default {
	port: settings.API_PORT,
	fetch: app.fetch,
};
