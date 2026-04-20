// ESM hoista imports estáticos — AUTH_ENABLE_DELETE_ACCOUNT deve ser setado ANTES
// que @/env seja carregado via qualquer import transitivo.
process.env.AUTH_ENABLE_DELETE_ACCOUNT = "false";

import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";

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

describe("DELETE /v1/auth/delete-user (flag desabilitada)", () => {
	it("retorna 404 quando AUTH_ENABLE_DELETE_ACCOUNT=false", async () => {
		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "user@example.com",
		});
		await auth_client.saveUser(user);

		const authHeaders = await auth_client.getAuthHeaders({ userId: user.id });
		const headers = new Headers(authHeaders);
		headers.set("content-type", "application/json");

		const res = await app.request("/v1/auth/delete-user", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});

		expect([404, 405]).toContain(res.status);
	});
});
