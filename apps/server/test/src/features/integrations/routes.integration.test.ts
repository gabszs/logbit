import { describe, expect, it } from "bun:test";
import {
	buildIntegrationPayload,
	createAuthContextWithActiveOrganization,
	createAuthContextWithoutActiveOrganization,
	createIntegration,
	createSecondOrganization,
	insertOrganizationDefaultIntegration,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "./helpers";
const { app } = await import("@/index");


describe("Integrations routes", () => {
	setupIntegrationTestLifecycle();

	it("GET /v1/integrations returns 200 with envelope", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-list-ok@example.com",
		);
		await createIntegration({ headers: ctx.headers, type: "webhook" });

		const res = await requestWithAuth("/v1/integrations", {
			method: "GET",
			headers: ctx.headers,
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			message: string;
			data: unknown[];
			metadata: Record<string, unknown>;
		};
		expect(body.message).toBe("Integrations successfully retrieved");
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.metadata).toBeDefined();
	});

	it("GET /v1/integrations returns 401 without session", async () => {
		const res = await app.request("/v1/integrations");
		expect(res.status).toBe(401);
	});

	it("GET /v1/integrations returns 403 when active organization is missing", async () => {
		const ctx = await createAuthContextWithoutActiveOrganization(
			"route-list-forbidden@example.com",
		);

		const res = await requestWithAuth("/v1/integrations", {
			method: "GET",
			headers: ctx.headers,
		});

		expect(res.status).toBe(403);
	});

	it("GET /v1/integrations/{id} returns 200 when integration exists", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-get-ok@example.com",
		);
		const integrationId = await createIntegration({
			headers: ctx.headers,
			type: "resend",
		});

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "GET",
			headers: ctx.headers,
		});
		expect(res.status).toBe(200);
	});

	it("GET /v1/integrations/{id} returns 404 for non-existing id", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-get-404@example.com",
		);

		const res = await requestWithAuth(`/v1/integrations/${Bun.randomUUIDv7()}`, {
			method: "GET",
			headers: ctx.headers,
		});
		expect(res.status).toBe(404);
	});

	it("GET /v1/integrations/{id} returns 404 for integration from another org", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-get-cross-org@example.com",
		);
		const secondOrganizationId = await createSecondOrganization();
		const otherOrgIntegrationId = await insertOrganizationDefaultIntegration({
			organizationId: secondOrganizationId,
			name: "Other Org Integration",
		});

		const res = await requestWithAuth(
			`/v1/integrations/${otherOrgIntegrationId}`,
			{
				method: "GET",
				headers: ctx.headers,
			},
		);
		expect(res.status).toBe(404);
	});

	it("POST /v1/integrations returns 201 with location header", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-post-ok@example.com",
		);
		const payload = buildIntegrationPayload("cloudflare_email");

		const res = await requestWithAuth("/v1/integrations", {
			method: "POST",
			headers: ctx.headers,
			body: payload,
		});
		expect(res.status).toBe(201);
		expect(res.headers.get("location")).toContain("/v1/integrations/");
	});

	it("POST /v1/integrations returns 400 for invalid payload", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-post-400@example.com",
		);

		const res = await requestWithAuth("/v1/integrations", {
			method: "POST",
			headers: ctx.headers,
			body: {
				name: "",
				type: "webhook",
				config: { apiKey: "wrong-config-shape" },
			},
		});
		expect(res.status).toBe(400);
	});

	it("PATCH /v1/integrations/{id} returns 200 for valid update", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-patch-ok@example.com",
		);
		const integrationId = await createIntegration({ headers: ctx.headers });

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: { name: "updated-name" },
		});

		expect(res.status).toBe(200);
	});

	it("PATCH /v1/integrations/{id} returns 400 for empty body", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-patch-empty@example.com",
		);
		const integrationId = await createIntegration({ headers: ctx.headers });

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {},
		});

		expect(res.status).toBe(400);
	});

	it("PATCH /v1/integrations/{id} returns 400 for type without config", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-patch-type-only@example.com",
		);
		const integrationId = await createIntegration({ headers: ctx.headers });

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: { type: "resend" },
		});

		expect(res.status).toBe(400);
	});

	it("PATCH /v1/integrations/{id} returns 400 for config without type", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-patch-config-only@example.com",
		);
		const integrationId = await createIntegration({ headers: ctx.headers });

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				config: {
					apiKey: "re_test_key",
					from: "sender@example.com",
					to: ["ops@example.com"],
				},
			},
		});

		expect(res.status).toBe(400);
	});

	it("PATCH /v1/integrations/{id} returns 404 when integration is missing", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-patch-404@example.com",
		);

		const res = await requestWithAuth(`/v1/integrations/${Bun.randomUUIDv7()}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: { name: "nope" },
		});

		expect(res.status).toBe(404);
	});

	it("DELETE /v1/integrations/{id} returns 204 when integration exists", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-delete-ok@example.com",
		);
		const integrationId = await createIntegration({ headers: ctx.headers });

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "DELETE",
			headers: ctx.headers,
		});

		expect(res.status).toBe(204);
	});

	it("DELETE /v1/integrations/{id} returns 404 when integration is missing", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"route-delete-404@example.com",
		);

		const res = await requestWithAuth(`/v1/integrations/${Bun.randomUUIDv7()}`, {
			method: "DELETE",
			headers: ctx.headers,
		});

		expect(res.status).toBe(404);
	});
});
