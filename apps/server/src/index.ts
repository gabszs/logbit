import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { showRoutes } from "hono/dev";
import { db } from "./db/index";
import authRouter from "./features/auth/routes";
import utilityRoutes from "./features/utils/routes";
import { openApiSchema } from "./lib/openapi";
import type { AppContext } from "./types";
import { settings } from "node:cluster";

if (settings.NODE_ENV !== "production") {
	await migrate(db, { migrationsFolder: "./src/db/migrations" });
}

const app = new OpenAPIHono();

const v1Routes = [authRouter] as const;

v1Routes.forEach((route) => {
	app.basePath("/v1").route("/", route);
});

// export const OrpcRouter = {
// 	profile: profileRouter,
// } as const;

// const rpcHandler = new RPCHandler(OrpcRouter);

// export type AppRouter = typeof OrpcRouter;
// export type RouterOutputs = InferRouterOutputs<AppRouter>;
// export type RouterInputs = InferRouterInputs<AppRouter>;

// // middlewares
// // open-telemetry
// app.use("*", otelConfig({ headerName: "otel-trace-id" }));
// app.use("*", httpInstrumentationMiddleware());

// // rate-limiter middleware
// app.use(
// 	rateLimiter<AppContext>({
// 		binding: (c) => c.env.RATE_LIMIT,
// 		keyGenerator: (c) => c.req.header("cf-connecting-ip") ?? "",
// 		skip: (c) => !c.req.path.startsWith("/api/") && !c.req.path.startsWith("/v1/"),
// 	}),
// );

// app.use(
// 	"/api/auth/*", // or replace with "*" to enable cors for all routes
// 	cors({
// 		origin: "http://localhost:3001", // replace with your origin
// 		allowHeaders: ["Content-Type", "Authorization"],
// 		allowMethods: ["POST", "GET", "OPTIONS"],
// 		exposeHeaders: ["Content-Length"],
// 		maxAge: 600,
// 		credentials: true,
// 	}),
// );

// app.on(["POST", "GET"], "/api/auth/*", (c) => {
// 	return auth.handler(c.req.raw);
// });

// // CORS
// app.use(
// 	"/*",
// 	cors({
// 		origin: env.CORS_ORIGIN.split(",") || [
// 			"http://localhost:3001",
// 			"http://192.168.1.13:3001",
// 			"http://localhost:3002",
// 			"http://localhost:4321",
// 		],
// 		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
// 		allowHeaders: [
// 			"Content-Type",
// 			"Authorization",
// 			"X-Requested-With",
// 			"Accept",
// 			"Origin",
// 			"x-api-key",
// 			"Upgrade",
// 			"Connection",
// 			"Sec-WebSocket-Key",
// 			"Sec-WebSocket-Version",
// 			"Sec-WebSocket-Protocol",
// 		],
// 		credentials: true,
// 		maxAge: 86400,
// 	}),
// );

// // better-auth
// app.use("*", async (c: AppContext, next) => {
// 	const path = c.req.path;
// 	if (path.startsWith("/api/auth") || path.startsWith("/api/orpc")) {
// 		const auth = createAuth(c, (c.req.raw as any).cf || {});
// 		c.set("auth", auth);
// 	}
// 	await next();
// });

// app.all("/api/auth/*", async (c) => {
// 	const auth = c.get("auth");
// 	return auth.handler(c.req.raw);
// });

// app.use("/v1/*", authMiddleware({ adminOnly: true }));

// // v1 routes
// app.route("/v1", documentsRoutes);

// // ORPC routes
// app.use("/api/orpc/*", async (c: AppContext) => {
// 	const { matched, response } = await rpcHandler.handle(c.req.raw, {
// 		prefix: "/api/orpc",
// 		context: await createContext({ context: c }),
// 	});

// 	if (!matched || !response) {
// 		return c.notFound();
// 	}
// 	return response;
// });

// utilities routes
app.route("/", utilityRoutes);
// docs
app.doc("/open-api", openApiSchema);
app.get(
	"/docs",
	Scalar((c: AppContext) => {
		return {
			pageTitle: "LogLog Documentation",
			sources: [{ url: "/open-api", title: "API" }],
			metaData: {
				title: "LogLog",
				description: "Complete API documentation for LogLog tracking platform",
				ogDescription: "LogLog API - Event tracking and analytics",
				ogTitle: "LogLog API Documentation",
			},
			theme: "deepSpace",
			layout: "modern",
			darkMode: true,
		};
	}),
);

showRoutes(app);

export type AppType = typeof app;
export default app;
