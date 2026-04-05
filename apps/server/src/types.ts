import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthSessionData, AuthType, AuthUser } from "./lib/auth";

export type AppContext = {
	Variables: {
		auth: AuthType;
	};
};

export type AuthAppContext = {
	Variables: AppContext["Variables"] & {
		user: AuthUser;
		session: AuthSessionData;
	};
};

export type AppType = OpenAPIHono<AppContext>;
export type AuthAppType = OpenAPIHono<AuthAppContext>;
