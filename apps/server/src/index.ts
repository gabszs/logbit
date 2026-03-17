import { httpInstrumentationMiddleware } from "@hono/otel";
import { OpenAPIHono } from "@hono/zod-openapi";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { showRoutes } from "hono/dev";
import { rateLimiter } from "hono-rate-limiter";
import { db } from "./db/index";
import { settings } from "./env";
import authRouter from "./features/auth/routes";
import utilityRoutes from "./features/utils/routes";
import { store } from "./lib/cache";
import { setupOpenApi } from "./lib/openapi";
import { consoleLogger, injectOtelTraceHeader } from "./lib/telemetry";
import type { AppContext } from "./types";

// RUN MIGRATIONS
if (settings.NODE_ENV !== "production") {
	await migrate(db, { migrationsFolder: "./src/db/migrations" });
}

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
		consoleLogger.warn(
			"[rate-limit] RATE_LIMIT_SLIDING_WINDOW is enabled but REDIS_URL is not set — falling back to MemoryStore.",
		);
	}
	app.use(
		rateLimiter<AppContext>({
			standardHeaders: settings.RATE_LIMIT_HEADERS,
			windowMs: settings.RATE_LIMIT_WINDOW_SECONDS * 1000,
			limit: settings.RATE_LIMIT_MAX_REQUESTS,
			keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "",
			...(store && { store }),
		}),
	);
}

// ORPC - Profile routes
// export const OrpcRouter = {
// 	profile: profileRouter,
// } as const;

// const rpcHandler = new RPCHandler(OrpcRouter);

// export type AppRouter = typeof OrpcRouter;
// export type RouterOutputs = InferRouterOutputs<AppRouter>;
// export type RouterInputs = InferRouterInputs<AppRouter>;

// app.use("/api/orpc/*", async (c) => {
// 	const { matched, response } = await rpcHandler.handle(c.req.raw, {
// 		prefix: "/api/orpc",
// 		context: await createContext({ context: c }),
// 	});

// 	if (!matched || !response) {
// 		return c.notFound();
// 	}
// 	return response;
// });

// V1 Routes
const v1Routes = [authRouter] as const;

v1Routes.forEach((route) => {
	app.basePath("/v1").route("/", route);
});

// utilities routes
app.route("/", utilityRoutes);

// docs
if (settings.ENABLE_OPEN_API) {
	await setupOpenApi(app);
}

showRoutes(app);

export type AppType = typeof app;
export default app;
