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

describe("Connections (cloudflare) integration", () => {
	setupIntegrationTestLifecycle();

	it("creates cloudflare connection with valid credentials", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"cloudflare-create-valid@example.com",
		);
		const payload = buildIntegrationPayload("cloudflare", {
			name: "cloudflare-main",
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
				config: { apiKey: string; zoneId: string };
			};
		};
		expect(body.data.type).toBe("cloudflare");
		expect(body.data.config).toEqual({
			apiKey: "cf_test_key",
			zoneId: "cf_zone_id",
		});
	});

	it("returns 400 when cloudflare zoneId is missing", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"cloudflare-create-invalid-zone@example.com",
		);
		const payload = buildIntegrationPayload("cloudflare");

		const res = await requestWithAuth("/v1/connections", {
			method: "POST",
			headers: ctx.headers,
			body: {
				...payload,
				config: { apiKey: "cf_test_key" },
			},
		});

		expect(res.status).toBe(400);
	});

	it("updates cloudflare credentials when type and config are provided together", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"cloudflare-patch-valid@example.com",
		);
		const connectionId = await createIntegration({
			headers: ctx.headers,
			type: "cloudflare",
			name: "cloudflare-patch",
		});

		const patchRes = await requestWithAuth(`/v1/connections/${connectionId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				type: "cloudflare",
				config: {
					apiKey: "cf_new_key",
					zoneId: "zone-42",
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

		expect(row[0]?.type).toBe("cloudflare");
		expect(row[0]?.config).toEqual({
			apiKey: "cf_new_key",
			zoneId: "zone-42",
		});
	});

	it("returns 400 when cloudflare type is sent with resend config", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"cloudflare-patch-mismatch@example.com",
		);
		const connectionId = await createIntegration({
			headers: ctx.headers,
			type: "cloudflare",
			name: "cloudflare-mismatch",
		});

		const patchRes = await requestWithAuth(`/v1/connections/${connectionId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				type: "cloudflare",
				config: { apiKey: "re_wrong_prefix" },
			},
		});

		expect(patchRes.status).toBe(400);
	});
});
