import { afterEach, beforeAll, expect } from "bun:test";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { TestHelpers } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { AppRouter } from "@/client/contracts";
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings({
	REDIS_URL: undefined,
});

const { auth } = await import("@/lib/auth");
const { app } = await import("@/index");
const { db } = await import("@/db");
const { models } = await import("@/db/models");
const { truncateAllTables } = await import("../../setup/db");

type AppRouterClient = RouterClient<AppRouter>;

let authClient: TestHelpers | null = null;

export type OrpcAuthContext = {
	userId: string;
	headers: Headers;
	token: string;
};

export const setupOrpcTestLifecycle = () => {
	beforeAll(async () => {
		const ctx = await auth.$context;
		authClient = ctx.test;
	});

	afterEach(async () => {
		await truncateAllTables();
	});
};

const getAuthClient = (): TestHelpers => {
	if (authClient == null) {
		throw new Error("Auth client is not initialized. Did you call setup?");
	}

	return authClient;
};

export const createAuthContext = async (
	email: string,
): Promise<OrpcAuthContext> => {
	const client = getAuthClient();
	const user = client.createUser({
		id: Bun.randomUUIDv7(),
		email,
		name: "Test User",
	});
	await client.saveUser(user);

	const { headers, token } = await client.login({ userId: user.id });
	const [settingsRow] = await db
		.select({ id: models.userSettings.id })
		.from(models.userSettings)
		.where(eq(models.userSettings.userId, user.id))
		.limit(1);

	if (!settingsRow) {
		const memberships = await db
			.select({ organizationId: models.members.organizationId })
			.from(models.members)
			.where(eq(models.members.userId, user.id))
			.limit(1);

		const organizationId = memberships[0]?.organizationId ?? null;
		const now = new Date();
		await db.insert(models.userSettings).values({
			userId: user.id,
			theme: "system",
			sourceId: null,
			integrationId: null,
			organizationId,
			createdAt: now,
			updatedAt: now,
		});
	}

	return {
		userId: user.id,
		headers: new Headers(headers),
		token,
	};
};

export const createAdditionalSession = async (
	userId: string,
): Promise<{ token: string; headers: Headers }> => {
	const client = getAuthClient();
	const { token, headers } = await client.login({ userId });
	return { token, headers: new Headers(headers) };
};

export const createOrpcHttpClient = (
	authHeaders?: Headers,
): AppRouterClient => {
	const link = new RPCLink({
		url: "http://test.local/orpc",
		fetch(request, init) {
			const baseRequest =
				typeof request === "string"
					? new Request(request, init)
					: new Request(request, init);
			const headers = new Headers(baseRequest.headers);

			if (authHeaders) {
				for (const [key, value] of authHeaders.entries()) {
					if (!headers.has(key)) {
						headers.set(key, value);
					}
				}
			}

			const finalRequest = new Request(baseRequest, { headers });
			return app.fetch(finalRequest);
		},
	});

	return createORPCClient<AppRouterClient>(link);
};

export const createCallContextFromHeaders = async (headers: Headers) => {
	const session = await auth.api.getSession({ headers });

	return {
		session,
		db,
		auth,
		headers,
	};
};

export const createAnonymousCallContext = () => {
	return {
		session: null,
		db,
		auth,
		headers: new Headers(),
	};
};

export const expectUnauthorizedError = async (promise: Promise<unknown>) => {
	await expect(promise).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
};
