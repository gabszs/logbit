import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
	createAuthContextWithActiveOrganization,
	createIntegration,
	getOrganizationDefaults,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "./helpers";

const { db } = await import("@/db");
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

		const patchRes = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: { name: "flow-main-updated" },
		});
		expect(patchRes.status).toBe(200);

		const row = await db
			.select({ name: models.integrations.name })
			.from(models.integrations)
			.where(eq(models.integrations.id, integrationId))
			.limit(1);
		expect(row[0]?.name).toBe("flow-main-updated");

		const deleteRes = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "DELETE",
			headers: ctx.headers,
		});
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

	it("multi-endpoint flow with default promotion", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"flow-default@example.com",
		);

		const integrationAId = await createIntegration({
			headers: ctx.headers,
			name: "Integration A",
			isDefault: true,
		});
		const integrationBId = await createIntegration({
			headers: ctx.headers,
			name: "Integration B",
			isDefault: false,
		});

		const promoteRes = await requestWithAuth(`/v1/integrations/${integrationBId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: { isDefault: true },
		});
		expect(promoteRes.status).toBe(200);

		const rows = await getOrganizationDefaults(ctx.organizationId);
		expect(rows.find((row) => row.id === integrationAId)?.isDefault).toBe(false);
		expect(rows.find((row) => row.id === integrationBId)?.isDefault).toBe(true);
		expect(rows.filter((row) => row.isDefault).length).toBe(1);
	});
});
