import { afterEach, beforeAll, expect } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings({
	REDIS_URL: undefined,
});

const { auth } = await import("@/lib/auth");
const { app } = await import("@/index");
const { db } = await import("@/db");
const { models } = await import("@/db/models");
const { truncateAllTables } = await import("../../setup/db");

const AUTHORIZATION_VALUE = "Bearer test-token";

let authClient: TestHelpers | null = null;

export type IntegrationType = "webhook" | "cloudflare_email" | "resend";

export type AuthContext = {
	userId: string;
	organizationId: string;
	headers: Headers;
};

export const setupIntegrationTestLifecycle = () => {
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

export const createAuthContextWithActiveOrganization = async (
	email: string,
): Promise<AuthContext> => {
	const client = getAuthClient();
	const user = client.createUser({
		id: Bun.randomUUIDv7(),
		email,
	});
	await client.saveUser(user);

	const { headers, token } = await client.login({ userId: user.id });
	const memberships = await db
		.select({ organizationId: models.members.organizationId })
		.from(models.members)
		.where(eq(models.members.userId, user.id))
		.limit(1);

	const organizationId = memberships[0]?.organizationId;
	if (organizationId == null) {
		throw new Error("Expected user to have an organization membership");
	}

	await db
		.update(models.sessions)
		.set({ activeOrganizationId: organizationId })
		.where(eq(models.sessions.token, token));

	const requestHeaders = new Headers(headers);
	requestHeaders.set("authorization", AUTHORIZATION_VALUE);
	requestHeaders.set("content-type", "application/json");

	return { userId: user.id, organizationId, headers: requestHeaders };
};

export const createAuthContextWithoutActiveOrganization = async (
	email: string,
): Promise<AuthContext> => {
	const ctx = await createAuthContextWithActiveOrganization(email);
	await db
		.update(models.sessions)
		.set({ activeOrganizationId: null })
		.where(eq(models.sessions.userId, ctx.userId));

	return ctx;
};

export const buildIntegrationPayload = (
	type: IntegrationType,
	options?: {
		name?: string;
		isActive?: boolean;
	},
) => {
	const base = {
		name: options?.name ?? `integration-${Bun.randomUUIDv7()}`,
		isActive: options?.isActive ?? true,
		type,
	};

	switch (type) {
		case "webhook":
			return {
				...base,
				config: {
					url: "https://example.com/webhook",
					secret: "top-secret",
				},
			};
		case "cloudflare_email":
			return {
				...base,
				config: {
					apiToken: "cf-token",
					accountId: "cf-account-id",
					from: "sender@example.com",
					to: ["ops@example.com"],
				},
			};
		case "resend":
			return {
				...base,
				config: {
					apiKey: "re_test_key",
					from: "sender@example.com",
					to: ["ops@example.com"],
				},
			};
	}
};

export const requestWithAuth = async (
	path: string,
	init: {
		headers: Headers;
		method?: "GET" | "POST" | "PATCH" | "DELETE";
		body?: unknown;
	},
) => {
	const { headers, body, ...rest } = init;
	return await app.request(path, {
		...rest,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
};

export const createIntegration = async ({
	headers,
	type = "webhook",
	name,
}: {
	headers: Headers;
	type?: IntegrationType;
	name?: string;
}) => {
	const payload = buildIntegrationPayload(type, { name });
	const res = await requestWithAuth("/v1/integrations", {
		method: "POST",
		headers,
		body: payload,
	});

	expect(res.status).toBe(201);
	const body = (await res.json()) as { data: { id: string } };
	return body.data.id;
};

export const getOrganizationDefaults = async (organizationId: string) => {
	return await db
		.select({
			id: models.integrations.id,
		})
		.from(models.integrations)
		.where(eq(models.integrations.organizationId, organizationId));
};

export const insertOrganizationDefaultIntegration = async ({
	organizationId,
	name = "org-default",
}: {
	organizationId: string;
	name?: string;
}) => {
	const id = Bun.randomUUIDv7();
	await db.insert(models.integrations).values({
		id,
		name,
		type: "webhook",
		organizationId,
		config: { url: "https://example.com/org" },
		isActive: true,
	});
	return id;
};

export const createSecondOrganization = async () => {
	const client = getAuthClient();
	const organization = client.createOrganization({
		id: Bun.randomUUIDv7(),
		name: "Second Org",
		slug: `second-org-${Bun.randomUUIDv7()}`,
	});
	await client.saveOrganization(organization);
	return organization.id;
};

export const countOrganizationDefaults = async (organizationId: string) => {
	const defaults = await db
		.select({ id: models.integrations.id })
		.from(models.integrations)
		.where(
			and(
				eq(models.integrations.organizationId, organizationId),
			),
		);
	return defaults.length;
};
