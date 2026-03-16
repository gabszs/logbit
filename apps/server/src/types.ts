import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthType } from "./lib/auth";

export type AppContext = {
	Variables: {
		auth: AuthType;
	};
};

export type AppType = OpenAPIHono<AppContext>;
