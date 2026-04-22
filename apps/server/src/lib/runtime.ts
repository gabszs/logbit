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
import { createDbClients } from "@/db";
import { parseSettings, type Settings } from "@/env";
import { createAuthRouter } from "@/features/auth/routes";
import { createIntegrationsRouter } from "@/features/integrations/routes";
import opampRouter from "@/features/opamp/routes";
import { createProfileRouter } from "@/features/profile/routes";
import { createSettingsRouter } from "@/features/settings/routes";
import { createSourcesRouter } from "@/features/sources/routes";
import utilityRoutes from "@/features/utils/routes";
import { createAuth } from "@/lib/auth";
import { BunRedisStore, createRedisClient } from "@/lib/cache";
import { createAuthenticateSession } from "@/lib/middleware";
import { setupOpenApi } from "@/lib/openapi";
import { createOrpc } from "@/lib/orpc";
import { injectOtelTraceHeader, logger } from "@/lib/telemetry";
import type { AppContext } from "@/types";

export type ServerRuntimeConfig = {
	settingsOverrides?: Partial<Settings>;
	runMigrations?: boolean;
	showRoutes?: boolean;
};

export type ServerRuntime = {
	settings: Settings;
	app: OpenAPIHono<AppContext>;
	auth: ReturnType<typeof createAuth>;
	db: ReturnType<typeof createDbClients>["db"];
	pgClient: ReturnType<typeof createDbClients>["pgClient"];
	redis: ReturnType<typeof createRedisClient>;
	orpcRouter: {
		profile: ReturnType<typeof createProfileRouter>;
		settings: ReturnType<typeof createSettingsRouter>;
	};
	shutdown: (options?: { exitProcess?: boolean }) => Promise<void>;
	apiPrefix: string;
};

export async function createServerRuntime(
	config: ServerRuntimeConfig = {},
): Promise<ServerRuntime> {
	const runtimeSettings = parseSettings(
		process.env,
		config.settingsOverrides ?? {},
	);
	const { db, pgClient } = createDbClients(runtimeSettings);
	const redis = createRedisClient(runtimeSettings);
	const auth = createAuth({
		settings: runtimeSettings,
		db,
		redis,
	});
	const authenticateSession = createAuthenticateSession({
		auth,
		settings: runtimeSettings,
	});
	const orpc = createOrpc({ db, auth });
	const profileRouter = createProfileRouter({
		protectedProcedure: orpc.protectedProcedure,
	});
	const settingsRouter = createSettingsRouter({
		protectedProcedure: orpc.protectedProcedure,
	});
	const authRouter = createAuthRouter({
		auth,
		settings: runtimeSettings,
	});
	const integrationsRouter = createIntegrationsRouter(db);
	const sourcesRouter = createSourcesRouter(db);

	type OrpcRouterType = {
		profile: typeof profileRouter;
		settings: typeof settingsRouter;
	};

	const OrpcRouter: OrpcRouterType = {
		profile: profileRouter,
		settings: settingsRouter,
	};

	if (config.runMigrations ?? true) {
		await migrate(db, { migrationsFolder: "./src/db/migrations" });
	}

	const app = new OpenAPIHono<AppContext>();

	app.use(
		cors({
			origin: runtimeSettings.CORS_ORIGIN,
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"x-client-ip",
				"cf-connecting-ip",
				"x-forwarded-for",
			],
			maxAge: 86400,
			credentials: true,
		}),
	);

	app.onError(
		problemDetailsHandler({
			mapError: (err) => {
				const status = err instanceof HTTPException ? err.status : 500;
				if (status >= 500) console.error(err);
				return undefined;
			},
		}),
	);

	app.use(compress());

	const instrumentationConfig = {
		serviceName: runtimeSettings.OTEL_SERVICE_NAME,
		serviceVersion: runtimeSettings.OTEL_SERVICE_VERSION,
		captureRequestHeaders:
			runtimeSettings.OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER,
	};
	app.use("*", httpInstrumentationMiddleware(instrumentationConfig));
	app.use(injectOtelTraceHeader());

	if (runtimeSettings.RATE_LIMIT_ENABLED) {
		if (!runtimeSettings.REDIS_URL) {
			logger.warn(
				"[rate-limit] RATE_LIMIT_SLIDING_WINDOW is enabled but REDIS_URL is not set — falling back to MemoryStore.",
				{ printConsole: true },
			);
		}
		app.use(
			rateLimiter<AppContext>({
				standardHeaders: runtimeSettings.RATE_LIMIT_HEADERS,
				windowMs: runtimeSettings.RATE_LIMIT_WINDOW_SECONDS * 1000,
				limit: runtimeSettings.RATE_LIMIT_MAX_REQUESTS,
				keyGenerator: (c) =>
					c.req.header("x-client-ip") ||
					c.req.header("cf-connecting-ip") ||
					c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
					"",
				store: runtimeSettings.REDIS_URL
					? new BunRedisStore<AppContext>(
							runtimeSettings.RATE_LIMIT_PREFIX,
							runtimeSettings.RATE_LIMIT_SLIDING_WINDOW,
							redis,
						)
					: new MemoryStore<AppContext>(),
			}),
		);
	}

	const rpcHandler = new RPCHandler(OrpcRouter);
	const apiPrefix = runtimeSettings.SERVE_STATIC ? "/api" : "";

	app.use(`${apiPrefix}/orpc/*`, async (c) => {
		try {
			const { matched, response } = await rpcHandler.handle(c.req.raw, {
				prefix: `${apiPrefix}/orpc`,
				context: await orpc.createContext({ context: c }),
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

	app.use(`${apiPrefix}/v1/*`, authenticateSession);

	app.route(`${apiPrefix}/v1`, authRouter);
	app.route(`${apiPrefix}/v1`, integrationsRouter);
	app.route(`${apiPrefix}/v1`, opampRouter);
	app.route(`${apiPrefix}/v1`, sourcesRouter);
	app.route(`${apiPrefix}/`, utilityRoutes);

	if (runtimeSettings.ENABLE_OPEN_API) {
		setupOpenApi(app, apiPrefix, {
			settings: runtimeSettings,
			auth,
		});
	}

	if (runtimeSettings.SERVE_STATIC) {
		app.use("/assets/*", serveStatic({ root: "./build" }));
		app.use("/favicon.ico", serveStatic({ path: "./build/favicon.ico" }));
		app.get("*", serveStatic({ path: "./build/index.html" }));
	}

	if (config.showRoutes ?? runtimeSettings.NODE_ENV !== "test") {
		showRoutes(app);
	}

	const shutdown = async ({ exitProcess = false } = {}) => {
		await pgClient.close();
		redis.close();
		if (exitProcess) {
			process.exit(0);
		}
	};

	return {
		settings: runtimeSettings,
		app,
		auth,
		db,
		pgClient,
		redis,
		orpcRouter: OrpcRouter,
		shutdown,
		apiPrefix,
	};
}

export type RuntimeAppRouter = {
	profile: ReturnType<typeof createProfileRouter>;
	settings: ReturnType<typeof createSettingsRouter>;
};

export type RuntimeRouterOutputs = InferRouterOutputs<RuntimeAppRouter>;
export type RuntimeRouterInputs = InferRouterInputs<RuntimeAppRouter>;
