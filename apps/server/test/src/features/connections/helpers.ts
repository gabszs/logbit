import { afterAll, afterEach, beforeAll, expect } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { overrideSettings, resetSettings } from "@/env";

const { models } = await import("@/db/models");
const { truncateAllTables } = await import("../../setup/db");
const { createTestRuntime, disposeTestRuntime } = await import(
	"../../setup/runtime"
);

const AUTHORIZATION_VALUE = "Bearer test-token";

let authClient: TestHelpers | null = null;
let runtime: Awaited<ReturnType<typeof createTestRuntime>> | null = null;

export type IntegrationType = "resend" | "cloudflare" | "clickhouse";

export type AuthContext = {
	userId: string;
	organizationId: string;
	headers: Headers;
};

export const setupIntegrationTestLifecycle = () => {
	beforeAll(async () => {
		resetSettings();
		overrideSettings({
			NODE_ENV: "test",
			REDIS_URL: undefined,
		});
		runtime = await createTestRuntime();
		const ctx = await runtime.auth.$context;
		authClient = ctx.test;
	});

	afterEach(async () => {
		const currentRuntime = getRuntime();
		await truncateAllTables(currentRuntime.db);
	});

	afterAll(async () => {
		if (runtime) {
			await disposeTestRuntime(runtime);
			runtime = null;
		}
		authClient = null;
		resetSettings();
	});
};

const getAuthClient = (): TestHelpers => {
	if (authClient == null) {
		throw new Error("Auth client is not initialized. Did you call setup?");
	}
	return authClient;
};

const getRuntime = () => {
	if (runtime == null) {
		throw new Error("Runtime is not initialized. Did you call setup?");
	}
	return runtime;
};

export const getIntegrationTestRuntime = () => getRuntime();

export const createAuthContextWithActiveOrganization = async (
	email: string,
): Promise<AuthContext> => {
	const client = getAuthClient();
	const currentRuntime = getRuntime();
	const user = client.createUser({
		id: Bun.randomUUIDv7(),
		email,
	});
	await client.saveUser(user);

	const { headers, token } = await client.login({ userId: user.id });
	const memberships = await currentRuntime.db
		.select({ organizationId: models.members.organizationId })
		.from(models.members)
		.where(eq(models.members.userId, user.id))
		.limit(1);

	const organizationId = memberships[0]?.organizationId;
	if (organizationId == null) {
		throw new Error("Expected user to have an organization membership");
	}

	await currentRuntime.db
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
	const currentRuntime = getRuntime();
	await currentRuntime.db
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
		case "cloudflare":
			return {
				...base,
				config: {
					apiKey: "cf_test_key",
					zoneId: "cf_zone_id",
				},
			};
		case "clickhouse":
			return {
				...base,
				config: {
					url: "http://localhost:8123",
					database: "loglog_test",
					username: "default",
					password: "",
				},
			};
		case "resend":
			return {
				...base,
				config: {
					apiKey: "re_test_key",
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
	const currentRuntime = getRuntime();
	const { headers, body, ...rest } = init;
	return await currentRuntime.app.request(path, {
		...rest,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
};

export const createIntegration = async ({
	headers,
	type = "resend",
	name,
}: {
	headers: Headers;
	type?: IntegrationType;
	name?: string;
}) => {
	const payload = buildIntegrationPayload(type, { name });
	const res = await requestWithAuth("/v1/connections", {
		method: "POST",
		headers,
		body: payload,
	});

	expect(res.status).toBe(201);
	const body = (await res.json()) as { data: { id: string } };
	return body.data.id;
};

export const getOrganizationDefaults = async (organizationId: string) => {
	const currentRuntime = getRuntime();
	return await currentRuntime.db
		.select({
			id: models.connections.id,
		})
		.from(models.connections)
		.where(eq(models.connections.organizationId, organizationId));
};

export const insertOrganizationDefaultIntegration = async ({
	organizationId,
	name = "org-default",
}: {
	organizationId: string;
	name?: string;
}) => {
	const currentRuntime = getRuntime();
	const id = Bun.randomUUIDv7();
	await currentRuntime.db.insert(models.connections).values({
		id,
		name,
		type: "resend",
		organizationId,
		config: { apiKey: "re_org_default_test_key" },
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
	const currentRuntime = getRuntime();
	const defaults = await currentRuntime.db
		.select({ id: models.connections.id })
		.from(models.connections)
		.where(and(eq(models.connections.organizationId, organizationId)));
	return defaults.length;
};
