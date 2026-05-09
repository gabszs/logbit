import {
	adminClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { settings } from "@/web/lib/config";

// import { apiKeyClient } from "@better-auth/api-key/client";
// const plugins = [
// 	apiKeyClient(),
// 	adminClient(),
// 	organizationClient(),
// ] as unknown as NonNullable<Parameters<typeof createAuthClient>[0]>["plugins"];

export const authClient = createAuthClient({
	baseURL: settings.serverUrl,
	basePath: "/v1/auth",
	fetchOptions: {
		credentials: "include",
	},
	plugins: [adminClient(), organizationClient(), twoFactorClient()],
});
