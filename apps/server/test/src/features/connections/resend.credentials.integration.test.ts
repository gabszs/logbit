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

describe("Connections (resend) integration", () => {
	setupIntegrationTestLifecycle();

	it("creates resend connection with valid credentials", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"resend-create-valid@example.com",
		);
		const payload = buildIntegrationPayload("resend", {
			name: "resend-main",
		});

		const res = await requestWithAuth("/v1/connections", {
			method: "POST",
			headers: ctx.headers,
			body: payload,
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			data: { id: string; type: string; config: { apiKey: string } };
		};
		expect(body.data.type).toBe("resend");
		expect(body.data.config).toEqual({ apiKey: "re_test_key" });
	});

	it("returns 400 when resend apiKey does not start with re_", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"resend-create-invalid-key@example.com",
		);
		const payload = buildIntegrationPayload("resend", {
			name: "resend-invalid",
		});

		const res = await requestWithAuth("/v1/connections", {
			method: "POST",
			headers: ctx.headers,
			body: {
				...payload,
				config: { apiKey: "invalid_key" },
			},
		});

		expect(res.status).toBe(400);
	});

	it("updates resend credentials when type and config are provided together", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"resend-patch-valid@example.com",
		);
		const connectionId = await createIntegration({
			headers: ctx.headers,
			type: "resend",
			name: "resend-patch",
		});

		const patchRes = await requestWithAuth(`/v1/connections/${connectionId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				type: "resend",
				config: { apiKey: "re_new_key" },
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

		expect(row[0]?.type).toBe("resend");
		expect(row[0]?.config).toEqual({ apiKey: "re_new_key" });
	});

	it("returns 400 when resend type is sent with cloudflare config", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"resend-patch-mismatch@example.com",
		);
		const connectionId = await createIntegration({
			headers: ctx.headers,
			type: "resend",
			name: "resend-mismatch",
		});

		const patchRes = await requestWithAuth(`/v1/connections/${connectionId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				type: "resend",
				config: {
					apiKey: "cf_key",
					zoneId: "zone-1",
				},
			},
		});

		expect(patchRes.status).toBe(400);
	});
});
