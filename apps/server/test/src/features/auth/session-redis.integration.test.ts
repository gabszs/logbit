// REDIS_URL está definido pelo preload — secondaryStorage em auth.ts fica ativo

import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { truncateAllTables } from "../../setup/db";
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings({
	REDIS_URL: process.env.REDIS_URL,
});

const { app } = await import("@/index");
const { auth } = await import("@/lib/auth");
const { redis } = await import("@/lib/cache");

describe("Sessions com Redis secondary storage", () => {
	let auth_client: TestHelpers;

	beforeAll(async () => {
		const ctx = await auth.$context;
		auth_client = ctx.test;
	});

	afterEach(async () => {
		await truncateAllTables();
	});

	it("cria sessão e armazena no Redis", async () => {
		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await auth_client.saveUser(user);

		const { token } = await auth_client.login({ userId: user.id });

		const redisValue = await redis.get(token);
		expect(redisValue).not.toBeNull();

		const sessionData = JSON.parse(redisValue as string);
		expect(sessionData).toMatchObject({ session: { userId: user.id } });
	});

	it("GET /v1/auth/get-session retorna dados corretos com sessão no Redis", async () => {
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
	});

	it("sign-out remove a entrada do Redis", async () => {
		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await auth_client.saveUser(user);

		const { token, headers: authHeaders } = await auth_client.login({
			userId: user.id,
		});

		expect(await redis.get(token)).not.toBeNull();

		const signOutRes = await app.request("/v1/auth/sign-out", {
			method: "POST",
			headers: authHeaders,
		});
		expect(signOutRes.status).toBe(200);

		expect(await redis.get(token)).toBeNull();
	});

	it("usa Redis como fast path — sessão persiste quando Redis é esvaziado", async () => {
		// secondaryStorage é um cache: miss no Redis → fallback ao banco → ainda 200
		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await auth_client.saveUser(user);

		const { token, headers: authHeaders } = await auth_client.login({
			userId: user.id,
		});

		await redis.del(token);

		const res = await app.request("/v1/auth/get-session", {
			headers: authHeaders,
		});
		expect(res.status).toBe(200);
	});

	// it("retorna 401 após sign-out", async () => {
	// 	const user = auth_client.createUser({
	// 		id: Bun.randomUUIDv7(),
	// 		email: "user@example.com",
	// 	});
	// 	await auth_client.saveUser(user);

	// 	const { headers: authHeaders } = await auth_client.login({
	// 		userId: user.id,
	// 	});

	// 	await app.request("/v1/auth/sign-out", {
	// 		method: "POST",
	// 		headers: authHeaders,
	// 	});

	// 	const res = await app.request("/v1/auth/get-session", {
	// 		headers: authHeaders,
	// 	});
	// 	expect(res.status).toBe(401);
	// });
});
