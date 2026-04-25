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
import proxyRouter from "./features/proxy/routes";
import opampRouter from "./features/opamp/routes";
import { profileRouter } from "./features/profile/routes";
import { settingsRouter } from "./features/settings/routes";
import sourcesRouter from "./features/sources/routes";
import utilityRoutes from "./features/utils/routes";
import { BunRedisStore, redis } from "./lib/cache";
import { authenticateSession } from "./lib/middleware";
import { setupOpenApi } from "./lib/openapi";
import { createContext } from "./lib/orpc";
import { injectOtelTraceHeader, logger } from "./lib/telemetry";
import type { AppContext } from "./types";

// RUN MIGRATIONS
await migrate(db, { migrationsFolder: "./src/db/migrations" });

// create app
const app = new OpenAPIHono<AppContext>();

// cors
app.use(
	cors({
		origin: settings.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
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
);

// on-error handler
app.onError(
	problemDetailsHandler({
		// includeStack: settings.NODE_ENV === "development",
		mapError: (err) => {
			const status = err instanceof HTTPException ? err.status : 500;
			if (status >= 500) console.error(err);
			return undefined;
		},
	}),
);

// middlewares
// compress
app.use(compress());

// open-telemetry
const instrumentationConfig = {
	serviceName: settings.OTEL_SERVICE_NAME,
	serviceVersion: settings.OTEL_SERVICE_VERSION,
	captureRequestHeaders:
		settings.OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER,
};
app.use("*", httpInstrumentationMiddleware(instrumentationConfig));
app.use(injectOtelTraceHeader());

// rate-limiter middleware
if (settings.RATE_LIMIT_ENABLED) {
	if (!settings.REDIS_URL) {
		logger.warn(
			"[rate-limit] RATE_LIMIT_SLIDING_WINDOW is enabled but REDIS_URL is not set — falling back to MemoryStore.",
			{ printConsole: true },
		);
	}
	app.use(
		rateLimiter<AppContext>({
			standardHeaders: settings.RATE_LIMIT_HEADERS,
			windowMs: settings.RATE_LIMIT_WINDOW_SECONDS * 1000,
			limit: settings.RATE_LIMIT_MAX_REQUESTS,
			keyGenerator: (c) =>
				c.req.header("x-client-ip") ||
				c.req.header("cf-connecting-ip") ||
				c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
				"",
			store: settings.REDIS_URL
				? new BunRedisStore<AppContext>(
						settings.RATE_LIMIT_PREFIX,
						settings.RATE_LIMIT_SLIDING_WINDOW,
					)
				: new MemoryStore<AppContext>(),
		}),
	);
}

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

const apiPrefix = settings.SERVE_STATIC ? "/api" : "";

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

// AUTH Middleware
app.use(`${apiPrefix}/v1/*`, authenticateSession);

// V1 Routes
app.route(`${apiPrefix}/v1`, authRouter);
app.route(`${apiPrefix}/v1`, connectionsRouter);
app.route(`${apiPrefix}/v1`, opampRouter);
app.route(`${apiPrefix}/v1`, sourcesRouter);
app.route(`${apiPrefix}/v1`, proxyRouter);

// utilities routes
app.route(`${apiPrefix}/`, utilityRoutes);

// docs
if (settings.ENABLE_OPEN_API) {
	setupOpenApi(app, apiPrefix);
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
