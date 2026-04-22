import { describe, expect, it } from "bun:test";
import {
	getAuthTestClient,
	getAuthTestRuntime,
	setupAuthTestLifecycle,
} from "./helpers";

setupAuthTestLifecycle({
	disableRedis: true,
});

describe("GET /v1/auth/get-session", () => {
	it("returns 200 with null body without session cookie", async () => {
		const runtime = getAuthTestRuntime();
		const res = await runtime.app.request("/v1/auth/get-session");
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});

	it("returns 200 and session data for authenticated request", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const user = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await authClient.saveUser(user);

		const authHeaders = await authClient.getAuthHeaders({ userId: user.id });
		const res = await runtime.app.request("/v1/auth/get-session", {
			headers: authHeaders,
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.user.id).toBe(user.id);
		expect(body.user.email).toBe("user@example.com");
	});
});

describe("POST /v1/auth/sign-out", () => {
	it("invalidates the session on sign-out", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const user = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await authClient.saveUser(user);

		const { headers: authHeaders, token } = await authClient.login({
			userId: user.id,
		});

		const beforeRes = await runtime.app.request("/v1/auth/get-session", {
			headers: authHeaders,
		});
		expect(beforeRes.status).toBe(200);

		const signOutRes = await runtime.app.request("/v1/auth/sign-out", {
			method: "POST",
			headers: authHeaders,
		});
		expect(signOutRes.status).toBe(200);

		const afterRes = await runtime.app.request("/v1/auth/get-session", {
			headers: authHeaders,
		});
		expect(afterRes.status).toBe(200);
		const afterBody = await afterRes.json();
		if (afterBody) {
			expect(afterBody.session?.token).not.toBe(token);
		} else {
			expect(afterBody).toBeNull();
		}
	});
});
