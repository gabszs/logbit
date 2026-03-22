import { httpInstrumentationMiddleware } from "@hono/otel";
import { OpenAPIHono } from "@hono/zod-openapi";
import { type InferRouterInputs, type InferRouterOutputs } from "@orpc/server";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { MemoryStore, rateLimiter } from "hono-rate-limiter";
import { showRoutes } from "hono/dev";
import { db } from "./db";
import { settings } from "./env";
import authRouter from "./features/auth/routes";
import { profileRouter } from "./features/profile/routes";
import utilityRoutes from "./features/utils/routes";
import { BunRedisStore } from "./lib/cache";
import { setupOpenApi } from "./lib/openapi";
import { createContext } from "./lib/orpc";
import { injectOtelTraceHeader, logger } from "./lib/telemetry";
import type { AppContext } from "./types";
import { RPCHandler } from "@orpc/server/fetch";

// RUN MIGRATIONS
await migrate(db, { migrationsFolder: "./src/db/migrations" });

const app = new OpenAPIHono<AppContext>();

// // middlewares
// // open-telemetry
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
				? new BunRedisStore(
						settings.RATE_LIMIT_PREFIX,
						settings.RATE_LIMIT_SLIDING_WINDOW,
					)
				: new MemoryStore(),
		}),
	);
}

// ORPC - Profile routes
export const OrpcRouter = {
	profile: profileRouter,
} as const;

const rpcHandler = new RPCHandler(OrpcRouter);

export type AppRouter = typeof OrpcRouter;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;

app.use("/v1/orpc/*", async (c) => {
	const { matched, response } = await rpcHandler.handle(c.req.raw, {
		prefix: "/api/orpc",
		context: await createContext({ context: c }),
	});

	if (!matched || !response) {
		return c.notFound();
	}
	return response;
});

// V1 Routes
const v1Routes = [authRouter] as const;

v1Routes.forEach((route) => {
	app.basePath("/v1").route("/", route);
});

// utilities routes
app.route("/", utilityRoutes);

// docs
if (settings.ENABLE_OPEN_API) {
	setupOpenApi(app);
}

showRoutes(app);

export type AppType = typeof app;
export default {
	port: settings.PORT,
	fetch: app.fetch,
};
