import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { models } from "@/db/models"; // não importa @/env, seguro como estático
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings({
	AUTH_ALLOWED_EMAIL_DOMAINS: ["testdomain.com"],
});

// Dynamic: todos os módulos que transitivamente importam @/env
const { db } = await import("@/db");
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

describe("databaseHook: user.create.before — restrição de domínio", () => {
	it("bloqueia signup com domínio não permitido", async () => {
		const res = await app.request("/v1/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "user@otherdomain.com",
				password: "password123",
				name: "User",
			}),
		});

		expect(res.status).toBe(403);
	});

	it("permite signup com domínio permitido", async () => {
		const res = await app.request("/v1/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			}),
		});

		expect(res.status).toBe(200);
	});
});

describe("databaseHook: user.create.after — provisionamento do primeiro usuário", () => {
	it("primeiro usuário recebe role=admin e emailVerified=true", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@testdomain.com"))
			.then((r) => r[0]);

		expect(user?.role).toBe("admin");
		expect(user?.emailVerified).toBe(true);
	});

	it("primeiro usuário recebe organização padrão com role=owner", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@testdomain.com"))
			.then((r) => r[0]);

		if (!user) throw new Error("user not found");

		const member = await db
			.select({ role: models.members.role })
			.from(models.members)
			.where(eq(models.members.userId, user.id))
			.then((r) => r[0]);

		expect(member?.role).toBe("owner");
	});

	it("primeiro usuário recebe userSettings com organizationId preenchido", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@testdomain.com"))
			.then((r) => r[0]);

		if (!user) throw new Error("user not found");

		const userSettings = await db
			.select()
			.from(models.userSettings)
			.where(eq(models.userSettings.userId, user.id))
			.then((r) => r[0]);

		expect(userSettings).toBeDefined();
		expect(userSettings?.organizationId).not.toBeNull();
	});

	it("usuário criado via testUtils mantém role explícita quando não é o primeiro usuário", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "plain@testdomain.com",
			role: "user",
		});
		await auth_client.saveUser(user);

		const savedUser = await db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "plain@testdomain.com"))
			.then((r) => r[0]);

		expect(savedUser?.role).toBe("user");
	});
});

describe("hook.before — bloqueio de signup após primeiro usuário", () => {
	it("bloqueia signup para segundo usuário", async () => {
		const first = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "first@testdomain.com",
		});
		await auth_client.saveUser(first);

		const res = await app.request("/v1/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "second@testdomain.com",
				password: "password123",
				name: "Second",
			}),
		});

		expect(res.status).toBe(403);
	});
});
