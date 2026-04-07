import { httpInstrumentationMiddleware } from "@hono/otel";
import { OpenAPIHono } from "@hono/zod-openapi";
import { MastraServer } from "@mastra/hono";
import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { showRoutes } from "hono/dev";
import { problemDetailsHandler } from "hono-problem-details";
import { MemoryStore, rateLimiter } from "hono-rate-limiter";
import { db, pgClient } from "./db";
import { settings } from "./env";
import { mastra } from "./features/ai";
import authRouter from "./features/auth/routes";
import opampRouter from "./features/opamp/routes";
import { profileRouter } from "./features/profile/routes";
import { settingsRouter } from "./features/settings/routes";
import utilityRoutes from "./features/utils/routes";
import { BunRedisStore, redis } from "./lib/cache";
import { setupOpenApi } from "./lib/openapi";
import { createContext } from "./lib/orpc";
import { injectOtelTraceHeader, logger } from "./lib/telemetry";
import type { AppContext } from "./types";
import { logger as honoLogger } from "hono/logger";

// RUN MIGRATIONS
await migrate(db, { migrationsFolder: "./src/db/migrations" });

// create app
const app = new OpenAPIHono<AppContext>();
const aiServer = new MastraServer({
	app,
	mastra,
	prefix: "/v1/ai",
	openapiPath: "/openapi.json",
	// customRouteAuthConfig: {"GET:/v1/ai/chat": true},
});

if (settings.NODE_ENV === "development") {
	app.use(honoLogger());
	app.use(async (c, next) => {
		console.log("Headers:", Object.fromEntries(c.req.raw.headers.entries()));
		await next();
	})
}

// cors
app.use(
	cors({
		origin: settings.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"x-client-ip",
			"cf-connecting-ip",
			"x-forwarded-for",
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
			console.error(err);
			return undefined; // undefined = segue o comportamento padrão
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

app.use("/orpc/*", async (c) => {
	try {
		const { matched, response } = await rpcHandler.handle(c.req.raw, {
			prefix: "/orpc",
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

// V1 Routes
app.route("/v1", authRouter);
app.route("/v1", opampRouter);

// utilities routes
app.route("/", utilityRoutes);

// docs
if (settings.ENABLE_OPEN_API) {
	setupOpenApi(app);
}

showRoutes(app);

export const shutdownDependencies = async () => {
	await pgClient.close(); // drena conexões ativas e fecha o pool
	redis.close(); // fecha conexão com Redis
	process.exit(0);
};

await aiServer.init();

["SIGTERM", "SIGINT", "beforeExit", "SIGQUIT"].forEach((event) => {
	process.on(event, shutdownDependencies);
});

export type AppType = typeof app;
export default {
	port: settings.API_PORT,
	fetch: app.fetch,
};
