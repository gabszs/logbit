import { describe, expect, it } from "bun:test";
import { models } from "@/db/models";
import {
	getAuthTestClient,
	getAuthTestRuntime,
	setupAuthTestLifecycle,
} from "./helpers";

setupAuthTestLifecycle({
	disableRedis: true,
});

describe("POST /v1/auth/sign-in/email", () => {
	it("retorna sessão para credenciais válidas", async () => {
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const result = await runtime.auth.api.signInEmail({
			body: { email: "admin@example.com", password: "password123" },
		});

		expect(result).toBeDefined();
	});

	it("rejeita senha incorreta com 401", async () => {
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "correct-password",
				name: "Admin",
			},
		});

		await expect(
			runtime.auth.api.signInEmail({
				body: { email: "admin@example.com", password: "wrong-password" },
			}),
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it("rejeita usuário inexistente com 401", async () => {
		const runtime = getAuthTestRuntime();
		await expect(
			runtime.auth.api.signInEmail({
				body: { email: "nobody@example.com", password: "password123" },
			}),
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it("rejeita usuário com email não verificado", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		await authClient.saveUser(
			authClient.createUser({
				id: Bun.randomUUIDv7(),
				email: "first@example.com",
			}),
		);

		const user = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "unverified@example.com",
			emailVerified: false,
		});
		await authClient.saveUser(user);

		const passwordHash = await Bun.password.hash("password123");
		await runtime.db.insert(models.accounts).values({
			accountId: user.id,
			providerId: "credential",
			userId: user.id,
			password: passwordHash,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const res = await runtime.app.request("/v1/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "unverified@example.com",
				password: "password123",
			}),
		});

		expect(res.status).toBe(403);
	});
});
