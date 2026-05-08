import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
	buildIntegrationPayload,
	createAuthContextWithActiveOrganization,
	createIntegration,
	getIntegrationTestRuntime,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "./helpers";

const { models } = await import("@/db/models");

describe("Connections (clickhouse) integration", () => {
	setupIntegrationTestLifecycle();

	it("creates clickhouse connection with valid credentials", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"clickhouse-create-valid@example.com",
		);
		const payload = buildIntegrationPayload("clickhouse", {
			name: "clickhouse-main",
		});

		const res = await requestWithAuth("/v1/connections", {
			method: "POST",
			headers: ctx.headers,
			body: payload,
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			data: {
				id: string;
				type: string;
				config: {
					url: string;
					database: string;
					username: string;
					password: string;
				};
			};
		};
		expect(body.data.type).toBe("clickhouse");
		expect(body.data.config).toEqual({
			url: "http://localhost:8123",
			database: "loglog_test",
			username: "default",
			password: "",
		});
	});

	it("returns 400 when clickhouse url is not a valid URL", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"clickhouse-create-invalid-url@example.com",
		);
		const payload = buildIntegrationPayload("clickhouse");

		const res = await requestWithAuth("/v1/connections", {
			method: "POST",
			headers: ctx.headers,
			body: {
				...payload,
				config: {
					url: "not-a-valid-url",
					database: "loglog_test",
					username: "default",
					password: "",
				},
			},
		});

		expect(res.status).toBe(400);
	});

	it("updates clickhouse credentials when config matches the existing connection type", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"clickhouse-patch-valid@example.com",
		);
		const connectionId = await createIntegration({
			headers: ctx.headers,
			type: "clickhouse",
			name: "clickhouse-patch",
		});

		const patchRes = await requestWithAuth(`/v1/connections/${connectionId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				config: {
					url: "http://clickhouse.local:8123",
					database: "observability",
					username: "analytics",
					password: "secret",
				},
			},
		});

		expect(patchRes.status).toBe(200);

		const runtime = getIntegrationTestRuntime();
		const row = await runtime.db
			.select({
				type: models.connections.type,
				config: models.connections.config,
			})
			.from(models.connections)
			.where(eq(models.connections.id, connectionId))
			.limit(1);

		expect(row[0]?.type).toBe("clickhouse");
		expect(row[0]?.config).toEqual({
			url: "http://clickhouse.local:8123",
			database: "observability",
			username: "analytics",
			password: "secret",
		});
	});

	it("returns 400 when config does not match existing clickhouse connection type", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"clickhouse-patch-mismatch@example.com",
		);
		const connectionId = await createIntegration({
			headers: ctx.headers,
			type: "clickhouse",
			name: "clickhouse-mismatch",
		});

		const patchRes = await requestWithAuth(`/v1/connections/${connectionId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				config: { apiKey: "re_test_key" },
			},
		});

		expect(patchRes.status).toBe(400);
	});
});
