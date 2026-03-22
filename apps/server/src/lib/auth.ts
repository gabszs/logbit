import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey, openAPI, phoneNumber } from "better-auth/plugins";
import { settings } from "@/env";
import { redis } from "@/lib/cache";
import "dotenv/config";
import { db } from "../db";
import { models } from "../db/models";
import { logger } from "./telemetry";

export const auth = betterAuth({
	basePath: settings.AUTH_BASE_PATH,
	secret: settings.AUTH_SECRET,
	trustedOrigins: settings.CORS_ORIGIN,
	advanced: {
		database: {
			generateId: false,
		},
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: models,
		usePlural: true,
	}),
	...(settings.REDIS_URL && {
		secondaryStorage: {
			get: async (key: string): Promise<string | null> => {
				return redis.get(key);
			},
			set: async (key: string, value: string, ttl?: number): Promise<void> => {
				await redis.set(key, value);
				if (ttl) await redis.expire(key, ttl);
			},
			del: async (key: string): Promise<void> => {
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
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
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
