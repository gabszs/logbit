import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
	createAuthContextWithActiveOrganization,
	createIntegration,
	getIntegrationTestRuntime,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "./helpers";

const { models } = await import("@/db/models");

describe("Integrations flows", () => {
	setupIntegrationTestLifecycle();

	it("main CRUD flow: create -> list -> get -> patch -> delete -> not found", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"flow-main@example.com",
		);
		const integrationId = await createIntegration({
			headers: ctx.headers,
			type: "webhook",
			name: "flow-main",
		});

		const listRes = await requestWithAuth("/v1/integrations", {
			method: "GET",
			headers: ctx.headers,
		});
		expect(listRes.status).toBe(200);
		const listBody = (await listRes.json()) as {
			data: Array<{ id: string }>;
		};
		expect(listBody.data.some((item) => item.id === integrationId)).toBe(true);

		const getRes = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "GET",
			headers: ctx.headers,
		});
		expect(getRes.status).toBe(200);

		const patchRes = await requestWithAuth(
			`/v1/integrations/${integrationId}`,
			{
				method: "PATCH",
				headers: ctx.headers,
				body: { name: "flow-main-updated" },
			},
		);
		expect(patchRes.status).toBe(200);

		const runtime = getIntegrationTestRuntime();
		const row = await runtime.db
			.select({ name: models.integrations.name })
			.from(models.integrations)
			.where(eq(models.integrations.id, integrationId))
			.limit(1);
		expect(row[0]?.name).toBe("flow-main-updated");

		const deleteRes = await requestWithAuth(
			`/v1/integrations/${integrationId}`,
			{
				method: "DELETE",
				headers: ctx.headers,
			},
		);
		expect(deleteRes.status).toBe(204);

		const getAfterDeleteRes = await requestWithAuth(
			`/v1/integrations/${integrationId}`,
			{
				method: "GET",
				headers: ctx.headers,
			},
		);
		expect(getAfterDeleteRes.status).toBe(404);
	});

	it("updates integration type and config together with valid payload", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"flow-type-switch@example.com",
		);
		const integrationId = await createIntegration({
			headers: ctx.headers,
			type: "webhook",
			name: "flow-type-switch",
		});

		const patchRes = await requestWithAuth(
			`/v1/integrations/${integrationId}`,
			{
				method: "PATCH",
				headers: ctx.headers,
				body: {
					type: "resend",
					config: {
						apiKey: "re_test_key",
						from: "sender@example.com",
						to: ["ops@example.com"],
					},
				},
			},
		);
		expect(patchRes.status).toBe(200);

		const runtime = getIntegrationTestRuntime();
		const row = await runtime.db
			.select({
				type: models.integrations.type,
				config: models.integrations.config,
			})
			.from(models.integrations)
			.where(eq(models.integrations.id, integrationId))
			.limit(1);

		expect(row[0]?.type).toBe("resend");
		expect(row[0]?.config).toEqual({
			apiKey: "re_test_key",
			from: "sender@example.com",
			to: ["ops@example.com"],
		});
	});
});
