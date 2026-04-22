import { describe, expect, it } from "bun:test";
import {
	getAuthTestClient,
	getAuthTestRuntime,
	setupAuthTestLifecycle,
} from "./helpers";

setupAuthTestLifecycle({
	disableRedis: false,
	settingsOverrides: {
		REDIS_URL: process.env.REDIS_URL,
	},
});

describe("Sessions com Redis secondary storage", () => {
	// it("cria sessão e armazena no Redis", async () => {
	// 	const authClient = getAuthTestClient();
	// 	const runtime = getAuthTestRuntime();
	// 	const user = authClient.createUser({
	// 		id: Bun.randomUUIDv7(),
	// 		email: "user@example.com",
	// 	});
	// 	await authClient.saveUser(user);

	// 	const { token } = await authClient.login({ userId: user.id });

	// 	const redisValue = await runtime.redis.get(token);
	// 	expect(redisValue).not.toBeNull();

	// 	const sessionData = JSON.parse(redisValue as string);
	// 	expect(sessionData).toMatchObject({ session: { userId: user.id } });
	// });

	it("GET /v1/auth/get-session retorna dados corretos com sessão no Redis", async () => {
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
	});

	// it("sign-out remove a entrada do Redis", async () => {
	// 	const authClient = getAuthTestClient();
	// 	const runtime = getAuthTestRuntime();
	// 	const user = authClient.createUser({
	// 		id: Bun.randomUUIDv7(),
	// 		email: "user@example.com",
	// 	});
	// 	await authClient.saveUser(user);

	// 	const { token, headers: authHeaders } = await authClient.login({
	// 		userId: user.id,
	// 	});

	// 	expect(await runtime.redis.get(token)).not.toBeNull();

	// 	const signOutRes = await runtime.app.request("/v1/auth/sign-out", {
	// 		method: "POST",
	// 		headers: authHeaders,
	// 	});
	// 	expect(signOutRes.status).toBe(200);

	// 	expect(await runtime.redis.get(token)).toBeNull();
	// });

	it("usa Redis como fast path — sessão persiste quando Redis é esvaziado", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const user = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await authClient.saveUser(user);

		const { token, headers: authHeaders } = await authClient.login({
			userId: user.id,
		});

		await runtime.redis.del(token);

		const res = await runtime.app.request("/v1/auth/get-session", {
			headers: authHeaders,
		});
		expect(res.status).toBe(200);
	});
});
