import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { AuthSessionData, AuthType, AuthUser } from "./lib/auth";

export type AppContextType = {
	Variables: HonoVariables & {
		auth: AuthType;
	};
	Bindings: HonoBindings;
};

export type AuthAppContextType = {
	Variables: AppContextType["Variables"] & {
		user: AuthUser;
		session: AuthSessionData;
	};
};
