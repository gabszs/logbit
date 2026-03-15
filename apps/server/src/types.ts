import type { AuthType } from "./lib/auth";

export type AppContext = {
	Variables: {
		auth: AuthType;
	};
};
