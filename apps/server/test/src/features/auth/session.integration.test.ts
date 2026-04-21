import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings({
	REDIS_URL: undefined,
});

// Dynamic: todos os módulos que transitivamente importam @/env
const { auth } = await import("@/lib/auth");
const { app } = await import("@/index");
const { truncateAllTables } = await import("../../setup/db");

let auth_client: TestHelpers;

beforeAll(async () => {
	const ctx = await auth.$context;
	auth_client = ctx.test;
});

afterEach(async () => {
	await truncateAllTables();
});

describe("GET /v1/auth/get-session", () => {
	it("returns 200 with null body without session cookie", async () => {
		const res = await app.request("/v1/auth/get-session");
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});

	it("returns 200 and session data for authenticated request", async () => {
		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await auth_client.saveUser(user);

		const authHeaders = await auth_client.getAuthHeaders({ userId: user.id });
		const res = await app.request("/v1/auth/get-session", {
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
		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await auth_client.saveUser(user);

		const { headers: authHeaders, token } = await auth_client.login({
			userId: user.id,
		});

		const beforeRes = await app.request("/v1/auth/get-session", {
			headers: authHeaders,
		});
		expect(beforeRes.status).toBe(200);

		const signOutRes = await app.request("/v1/auth/sign-out", {
			method: "POST",
			headers: authHeaders,
		});
		expect(signOutRes.status).toBe(200);

		const afterRes = await app.request("/v1/auth/get-session", {
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
