import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { models } from "@/db/models";
import {
	getAuthTestClient,
	getAuthTestRuntime,
	setupAuthTestLifecycle,
} from "./helpers";

setupAuthTestLifecycle({
	disableRedis: true,
	settingsOverrides: {
		AUTH_ENABLE_DELETE_ACCOUNT: true,
	},
});

describe("DELETE /v1/auth/delete-user (flag habilitada)", () => {
	it("deleta a conta do usuário autenticado", async () => {
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

		expect(res.status).toBe(200);

		const deletedUser = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.id, user.id))
			.then((r) => r[0]);

		expect(deletedUser).toBeUndefined();
	});

	it("retorna 401 sem autenticação", async () => {
		const runtime = getAuthTestRuntime();
		const res = await runtime.app.request("/v1/auth/delete-user", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
	});
});
