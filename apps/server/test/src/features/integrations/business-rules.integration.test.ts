import { describe, expect, it } from "bun:test";
import {
	buildIntegrationPayload,
	countOrganizationDefaults,
	createAuthContextWithActiveOrganization,
	createIntegration,
	createSecondOrganization,
	getOrganizationDefaults,
	insertOrganizationDefaultIntegration,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "./helpers";

describe("Integrations business rules and validations", () => {
	setupIntegrationTestLifecycle();

	it("keeps a single default per org when creating a second default", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"rule-create-default@example.com",
		);
		const integrationAId = await createIntegration({
			headers: ctx.headers,
			name: "A",
			isDefault: true,
		});
		const integrationBId = await createIntegration({
			headers: ctx.headers,
			name: "B",
			isDefault: true,
		});

		const rows = await getOrganizationDefaults(ctx.organizationId);
		expect(rows.find((row) => row.id === integrationAId)?.isDefault).toBe(
			false,
		);
		expect(rows.find((row) => row.id === integrationBId)?.isDefault).toBe(true);
		expect(rows.filter((row) => row.isDefault).length).toBe(1);
	});

	it("keeps a single default per org when promoting by patch", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"rule-patch-default@example.com",
		);
		const integrationAId = await createIntegration({
			headers: ctx.headers,
			name: "A",
			isDefault: true,
		});
		const integrationBId = await createIntegration({
			headers: ctx.headers,
			name: "B",
			isDefault: false,
		});

		const res = await requestWithAuth(`/v1/integrations/${integrationBId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: { isDefault: true },
		});
		expect(res.status).toBe(200);

		const rows = await getOrganizationDefaults(ctx.organizationId);
		expect(rows.find((row) => row.id === integrationAId)?.isDefault).toBe(
			false,
		);
		expect(rows.find((row) => row.id === integrationBId)?.isDefault).toBe(true);
		expect(rows.filter((row) => row.isDefault).length).toBe(1);
	});

	it("allows zero defaults when unsetting the only default", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"rule-zero-unset@example.com",
		);
		const integrationId = await createIntegration({
			headers: ctx.headers,
			isDefault: true,
		});

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: { isDefault: false },
		});
		expect(res.status).toBe(200);

		expect(await countOrganizationDefaults(ctx.organizationId)).toBe(0);
	});

	it("allows zero defaults when deleting the only default", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"rule-zero-delete@example.com",
		);
		const integrationId = await createIntegration({
			headers: ctx.headers,
			isDefault: true,
		});

		const res = await requestWithAuth(`/v1/integrations/${integrationId}`, {
			method: "DELETE",
			headers: ctx.headers,
		});
		expect(res.status).toBe(204);

		expect(await countOrganizationDefaults(ctx.organizationId)).toBe(0);
	});

	it("keeps organization isolation for default rule", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"rule-isolation@example.com",
		);
		const secondOrganizationId = await createSecondOrganization();
		const org2DefaultId = await insertOrganizationDefaultIntegration({
			organizationId: secondOrganizationId,
			name: "Org2 Default",
		});

		await createIntegration({
			headers: ctx.headers,
			name: "Org1 Default",
			isDefault: true,
		});

		const org2Rows = await getOrganizationDefaults(secondOrganizationId);
		expect(org2Rows.find((row) => row.id === org2DefaultId)?.isDefault).toBe(
			true,
		);
		expect(org2Rows.filter((row) => row.isDefault).length).toBe(1);
	});

	it("keeps at most one default after concurrent promotions", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"rule-concurrency@example.com",
		);
		const integrationAId = await createIntegration({
			headers: ctx.headers,
			name: "A",
			isDefault: false,
		});
		const integrationBId = await createIntegration({
			headers: ctx.headers,
			name: "B",
			isDefault: false,
		});

		const [resA, resB] = await Promise.all([
			requestWithAuth(`/v1/integrations/${integrationAId}`, {
				method: "PATCH",
				headers: ctx.headers,
				body: { isDefault: true },
			}),
			requestWithAuth(`/v1/integrations/${integrationBId}`, {
				method: "PATCH",
				headers: ctx.headers,
				body: { isDefault: true },
			}),
		]);

		expect([resA.status, resB.status].some((status) => status === 200)).toBe(
			true,
		);
		expect(
			await countOrganizationDefaults(ctx.organizationId),
		).toBeLessThanOrEqual(1);
	});

	it("returns 400 for invalid discriminated type/config on create", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"rule-invalid-create@example.com",
		);
		const payload = buildIntegrationPayload("webhook");

		const res = await requestWithAuth("/v1/integrations", {
			method: "POST",
			headers: ctx.headers,
			body: {
				...payload,
				config: {
					apiKey: "re_test_key",
					from: "sender@example.com",
					to: ["ops@example.com"],
				},
			},
		});

		expect(res.status).toBe(400);
	});
});
