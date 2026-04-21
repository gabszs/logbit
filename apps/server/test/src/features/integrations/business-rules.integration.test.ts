import { describe, expect, it } from "bun:test";
import {
	buildIntegrationPayload,
	createAuthContextWithActiveOrganization,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "./helpers";

describe("Integrations business rules and validations", () => {
	setupIntegrationTestLifecycle();

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
