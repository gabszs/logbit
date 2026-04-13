import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey, openAPI, phoneNumber } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { settings } from "@/env";
import { redis } from "@/lib/cache";
import "dotenv/config";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { db } from "../db";
import { models } from "../db/models";

const hasAllowedEmailDomain = (email: string): boolean => {
	if (!settings.AUTH_ALLOWED_EMAIL_DOMAINS?.length) return true;
	return settings.AUTH_ALLOWED_EMAIL_DOMAINS.some((domain) =>
		email.toLowerCase().endsWith(`@${domain.trim().toLowerCase()}`),
	);
};

const isOnlyUser = async (userId: string): Promise<boolean> => {
	const result = await db
		.select({ id: models.users.id })
		.from(models.users)
		.limit(2);

	return result.length === 1 && result[0]?.id === userId;
};

const hasAnyUser = async (): Promise<boolean> => {
	const result = await db
		.select({ id: models.users.id })
		.from(models.users)
		.limit(1);

	return result.length > 0;
};

const getDefaultOrganizationSlug = (email: string) =>
	`${email
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")}-organization`;

export const auth = betterAuth({
	basePath: settings.AUTH_BASE_PATH,
	secret: settings.AUTH_SECRET,
	trustedOrigins: settings.CORS_ORIGIN,
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		password: {
			hash: (password: string) => Bun.password.hash(password),
			verify: ({ password, hash }: { password: string; hash: string }) =>
				Bun.password.verify(password, hash),
		},
	},
	emailVerification: {
		sendOnSignUp: false,
	},
	advanced: {
		database: {
			generateId: false,
		},
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/sign-up/email") return;
			if (!(await hasAnyUser())) return;
			throw new APIError("FORBIDDEN", {
				message:
					"Sign up is disabled because a user already exists. Ask an administrator to create your account.",
			});
		}),
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
				before: async (user) => {
					if (!hasAllowedEmailDomain(user.email)) {
						throw new APIError("FORBIDDEN", {
							message:
								"Access is restricted to approved email domains only. Please check with your administrator. Check AUTH_ALLOWED_EMAIL_DOMAINS.",
						});
					}
				},
				after: async (user) => {
					const now = new Date();

					if (await isOnlyUser(user.id)) {
						const organizationId = Bun.randomUUIDv7();
						await db
							.update(models.users)
							.set({ role: "admin", emailVerified: true })
							.where(eq(models.users.id, user.id));
						await db.insert(models.organizations).values({
							id: organizationId,
							name: `${user.email}'s organization`,
							slug: getDefaultOrganizationSlug(user.email),
							logo: "",
							createdAt: now,
						});

						await db.insert(models.members).values({
							organizationId,
							userId: user.id,
							role: "owner",
							createdAt: now,
						});
					}

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
	session: {
		expiresIn: settings.AUTH_SESSION_DURATION_SECONDS,
	},
	plugins: [
		apiKey({
			apiKeyHeaders: ["x-api-key"],
			defaultPrefix: "sk_",
		}),
		admin(),
		organization({
			// sendInvitationEmail: async (data) => {
			// 	const inviteLink = `${settings.HOSTNAME}${settings.AUTH_BASE_PATH}/accept-invitation?invitationId=${data.id}`;
			// 	console.log("invitation:", inviteLink);
			// },
			organizationHooks: {
				beforeCreateOrganization: async ({ user }) => {
					if (!hasAllowedEmailDomain(user.email)) {
						throw new APIError("FORBIDDEN", {
							message:
								"Access is restricted to approved email domains. Check AUTH_ALLOWED_EMAIL_DOMAINS.",
						});
					}
					if (user.role === "admin") return;
					throw new APIError("FORBIDDEN", {
						message:
							"Only platform admins can create organizations. Check AUTH_ALLOWED_EMAIL_DOMAINS and AUTH_ALLOW_MULTIPLE_ROOT_USERS.",
					});
				},
			},
		}),
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
