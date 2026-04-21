import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { models } from "@/db/models";
import { truncateAllTables } from "../../setup/db";
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings({
	AUTH_ENABLE_DELETE_ACCOUNT: true,
});

const { db } = await import("@/db");
const { app } = await import("@/index");
const { auth } = await import("@/lib/auth");

describe("DELETE /v1/auth/delete-user (flag habilitada)", () => {
	let auth_client: TestHelpers;

	beforeAll(async () => {
		const ctx = await auth.$context;
		auth_client = ctx.test;
	});

	afterEach(async () => {
		await truncateAllTables();
	});

	it("deleta a conta do usuário autenticado", async () => {
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

		expect(res.status).toBe(200);

		const deletedUser = await db
			.select()
			.from(models.users)
			.where(eq(models.users.id, user.id))
			.then((r) => r[0]);

		expect(deletedUser).toBeUndefined();
	});

	it("retorna 401 sem autenticação", async () => {
		const res = await app.request("/v1/auth/delete-user", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
	});
});
