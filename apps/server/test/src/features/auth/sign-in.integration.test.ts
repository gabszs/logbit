import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { models } from "@/db/models";
import { truncateAllTables } from "../../setup/db";
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings();

const { db } = await import("@/db");
const { app } = await import("@/index");
const { auth } = await import("@/lib/auth");

let auth_client: TestHelpers;

beforeAll(async () => {
	const ctx = await auth.$context;
	auth_client = ctx.test;
});

afterEach(async () => {
	await truncateAllTables();
});

describe("POST /v1/auth/sign-in/email", () => {
	it("retorna sessão para credenciais válidas", async () => {
		// signUpEmail cria o primeiro usuário (sem bloqueio) e o after-hook seta emailVerified=true
		await auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const result = await auth.api.signInEmail({
			body: { email: "admin@example.com", password: "password123" },
		});

		expect(result).toBeDefined();
	});

	it("rejeita senha incorreta com 401", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "correct-password",
				name: "Admin",
			},
		});

		await expect(
			auth.api.signInEmail({
				body: { email: "admin@example.com", password: "wrong-password" },
			}),
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it("rejeita usuário inexistente com 401", async () => {
		await expect(
			auth.api.signInEmail({
				body: { email: "nobody@example.com", password: "password123" },
			}),
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it("rejeita usuário com email não verificado", async () => {
		// Salva um primeiro usuário para que isOnlyUser não eleve o próximo para admin+verified
		await auth_client.saveUser(
			auth_client.createUser({
				id: Bun.randomUUIDv7(),
				email: "first@example.com",
			}),
		);

		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "unverified@example.com",
			emailVerified: false,
		});
		await auth_client.saveUser(user);

		const passwordHash = await Bun.password.hash("password123");
		await db.insert(models.accounts).values({
			accountId: user.id,
			providerId: "credential",
			userId: user.id,
			password: passwordHash,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const res = await app.request("/v1/auth/sign-in/email", {
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
