import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_SERVER_URL,
	basePath: "/v1/auth",
	fetchOptions: {
		credentials: "include",
	},
});
