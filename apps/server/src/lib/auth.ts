import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey, openAPI, phoneNumber } from "better-auth/plugins";
import { settings } from "@/env";
import { redis } from "@/lib/cache";
import "dotenv/config";
import { db } from "../db";
import { models } from "../db/models";

export const auth = betterAuth({
	basePath: settings.AUTH_BASE_PATH,
	secret: settings.AUTH_SECRET,
	trustedOrigins: settings.CORS_ORIGIN,
	advanced: {
		database: {
			generateId: false,
		},
	},
	user: {
		deleteUser: {
			enabled: settings.AUTH_ENABLE_DELETE_ACCOUNT,
		},
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: models,
		usePlural: true,
	}),
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					const now = new Date();
					await db.insert(models.userSettings).values({
						userId: user.id,
						theme: "system",
						createdAt: now,
						updatedAt: now,
					});
				},
			},
		},
	},
	...(settings.REDIS_URL && {
		secondaryStorage: {
			get: async (key: string): Promise<string | null> => {
				return redis.get(key);
			},
			set: async (key: string, value: string, ttl?: number): Promise<void> => {
				await redis.set(key, value);
				if (ttl) await redis.expire(key, ttl);
			},
			delete: async (key: string): Promise<void> => {
				await redis.del(key);
			},
		},
	}),
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
		password: {
			hash: (password: string) => Bun.password.hash(password),
			verify: ({ password, hash }: { password: string; hash: string }) =>
				Bun.password.verify(password, hash),
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		// cookieCache: {
		// 	enabled: true,
		// 	maxAge: 60 * 5,
		// },
	},
	plugins: [
		apiKey({
			apiKeyHeaders: ["x-api-key"],
			defaultPrefix: "sk_",
		}),
		phoneNumber(),
		admin(),
		openAPI({
			path: settings.AUTH_OPEN_API_PATH,
			theme: settings.SCALAR_THEME,
			disableDefaultReference: true,
		}),
	],
});

export type AuthType = typeof auth;
export type AuthSession = NonNullable<
	Awaited<ReturnType<typeof auth.api.getSession>>
>;
export type AuthUser = AuthSession["user"];
export type AuthSessionData = AuthSession["session"];
