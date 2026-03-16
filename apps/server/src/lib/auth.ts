import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { settings } from "@/env";
import { db } from "../db";
import { models } from "../db/models";

export const auth = betterAuth({
	basePath: settings.AUTH_BASE_PATH,
	secret: settings.AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: models,
	}),
	emailAndPassword: {
		enabled: true,
	},
	trustedOrigins: settings.CORS_ORIGIN,
	plugins: [
		...(settings.ENABLE_OPEN_API
			? [
					openAPI({
						path: settings.AUTH_OPEN_API_PATH,
						theme: settings.SCALAR_THEME,
					}),
				]
			: []),
	],
});

export async function authenticateSession(c) {
	const auth = c.get("auth");
	const session = await auth.api.getSession({ headers: c.req.raw.headers });

	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	return {
		user: session.user,
		session: session.session,
	};
}

export type AuthType = typeof auth;
export type { createAuth };
