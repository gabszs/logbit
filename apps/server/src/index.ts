import { env } from "cloudflare:workers";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { OpenAPIHono } from "@hono/zod-openapi";
import { instrument } from "@microlabs/otel-cf-workers";
import { RPCHandler } from "@orpc/server/fetch";
import { Scalar } from "@scalar/hono-api-reference";
import { type InferRouterInputs, type InferRouterOutputs } from "@trpc/server";
import { cors } from "hono/cors";
import { showRoutes } from "hono/dev";
import { appendTrailingSlash } from "hono/trailing-slash";
import { rateLimiter } from "hono-rate-limiter";
import documentsRoutes from "./features/documents/routes";
import { profileRouter } from "./features/profile/routes";
import utilityRoutes from "./features/utils/routes";
import { createAuth } from "./lib/auth";
import { authMiddleware, otelConfig } from "./lib/middleware";
import { openApiSchema } from "./lib/openapi";
import { createContext } from "./lib/orpc";
import { otel_config } from "./lib/telemetry";
import { type AppContext } from "./types";

const app = new OpenAPIHono();

export const OrpcRouter = {
	profile: profileRouter,
} as const;

const rpcHandler = new RPCHandler(OrpcRouter);

export type AppRouter = typeof OrpcRouter;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;

// middlewares
// open-telemetry
app.use("*", otelConfig({ headerName: "otel-trace-id" }));
app.use("*", httpInstrumentationMiddleware());

// trailing slash
app.use(appendTrailingSlash());

// rate-limiter middleware
app.use(
	rateLimiter<AppContext>({
		binding: (c) => c.env.RATE_LIMIT,
		keyGenerator: (c) => c.req.header("cf-connecting-ip") ?? "",
		skip: (c) => !c.req.path.startsWith("/api/") && !c.req.path.startsWith("/v1/"),
	}),
);

// CORS
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN.split(",") || [
			"http://localhost:3001",
			"http://192.168.1.13:3001",
			"http://localhost:3002",
			"http://localhost:4321",
		],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"X-Requested-With",
			"Accept",
			"Origin",
			"x-api-key",
			"Upgrade",
			"Connection",
			"Sec-WebSocket-Key",
			"Sec-WebSocket-Version",
			"Sec-WebSocket-Protocol",
		],
		credentials: true,
		maxAge: 86400,
	}),
);

// better-auth
app.use("*", async (c: AppContext, next) => {
	const path = c.req.path;
	if (path.startsWith("/api/auth") || path.startsWith("/api/orpc")) {
		const auth = createAuth(c, (c.req.raw as any).cf || {});
		c.set("auth", auth);
	}
	await next();
});

app.all("/api/auth/*", async (c) => {
	const auth = c.get("auth");
	return auth.handler(c.req.raw);
});

app.use("/v1/*", authMiddleware({ adminOnly: true }));

// v1 routes
app.route("/v1", documentsRoutes);

// ORPC routes
app.use("/api/orpc/*", async (c: AppContext) => {
	const { matched, response } = await rpcHandler.handle(c.req.raw, {
		prefix: "/api/orpc",
		context: await createContext({ context: c }),
	});

	if (!matched || !response) {
		return c.notFound();
	}
	return response;
});

// utilities routes
app.route("/", utilityRoutes);
// docs
app.doc("/doc", openApiSchema);
app.get(
	"/docs",
	Scalar((c: AppContext) => {
		return {
			url: "/doc",
			pageTitle: "IMOB API Documentation",
			metaData: {
				title: "IMOB API",
				description: "Complete API documentation for IMOB tracking platform",
				ogDescription: "IMOB API - Event tracking and analytics",
				ogTitle: "IMOB API Documentation",
				// ogImage: "https://your-domain.com/og-image.png", // Optional OG image
			},
			favicon: "/home/gabriel/Documents/tracker/apps/server/src/favicon.ico", // URL do seu favicon
			// Customização adicional
			theme: "deepSpace", // "default", "alternate", "moon", "purple", "solarized", "bluePlanet", "saturn", "kepler", "mars", "deepSpace"
			layout: "modern", // "modern" ou "classic"
			darkMode: true, // Habilita dark mode por padrão
		};
	}),
);

showRoutes(app);

export type AppType = typeof app;
export default app
