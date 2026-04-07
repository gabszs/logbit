import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { AuthSessionData, AuthType, AuthUser } from "./lib/auth";

export type AppContext = {
	Variables: HonoVariables & {
		auth: AuthType;
	};
	Bindings: HonoBindings;
};

export type AuthAppContext = {
	Variables: AppContext["Variables"] & {
		user: AuthUser;
		session: AuthSessionData;
	};
};

export type AppType = OpenAPIHono<AppContext>;
export type AuthAppType = OpenAPIHono<AuthAppContext>;
