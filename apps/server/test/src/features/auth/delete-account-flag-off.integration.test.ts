import { describe, expect, it } from "bun:test";
import {
	getAuthTestClient,
	getAuthTestRuntime,
	setupAuthTestLifecycle,
} from "./helpers";

setupAuthTestLifecycle({
	disableRedis: true,
	settingsOverrides: {
		AUTH_ENABLE_DELETE_ACCOUNT: false,
	},
});

describe("DELETE /v1/auth/delete-user (flag desabilitada)", () => {
	it("retorna 404 quando AUTH_ENABLE_DELETE_ACCOUNT=false", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const user = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await authClient.saveUser(user);

		const authHeaders = await authClient.getAuthHeaders({ userId: user.id });
		const headers = new Headers(authHeaders);
		headers.set("content-type", "application/json");

		const res = await runtime.app.request("/v1/auth/delete-user", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect([404, 405]).toContain(res.status);
	});
});
