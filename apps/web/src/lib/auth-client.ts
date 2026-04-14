import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// import { apiKeyClient } from "@better-auth/api-key/client";
// const plugins = [
// 	apiKeyClient(),
// 	adminClient(),
// 	organizationClient(),
// ] as unknown as NonNullable<Parameters<typeof createAuthClient>[0]>["plugins"];

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_SERVER_URL,
	basePath: "/v1/auth",
	fetchOptions: {
		credentials: "include",
	},
	plugins: [adminClient(), organizationClient()],
});
