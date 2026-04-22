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
		AUTH_ALLOWED_EMAIL_DOMAINS: ["testdomain.com"],
	},
});

describe("databaseHook: user.create.before — restrição de domínio", () => {
	it("bloqueia signup com domínio não permitido", async () => {
		const runtime = getAuthTestRuntime();
		const res = await runtime.app.request("/v1/auth/sign-up/email", {
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
		const runtime = getAuthTestRuntime();
		const res = await runtime.app.request("/v1/auth/sign-up/email", {
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
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@testdomain.com"))
			.then((r) => r[0]);

		expect(user?.role).toBe("admin");
		expect(user?.emailVerified).toBe(true);
	});

	it("primeiro usuário recebe organização padrão com role=owner", async () => {
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@testdomain.com"))
			.then((r) => r[0]);

		if (!user) throw new Error("user not found");

		const member = await runtime.db
			.select({ role: models.members.role })
			.from(models.members)
			.where(eq(models.members.userId, user.id))
			.then((r) => r[0]);

		expect(member?.role).toBe("owner");
	});

	it("primeiro usuário recebe userSettings com organizationId preenchido", async () => {
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@testdomain.com"))
			.then((r) => r[0]);

		if (!user) throw new Error("user not found");

		const userSettings = await runtime.db
			.select()
			.from(models.userSettings)
			.where(eq(models.userSettings.userId, user.id))
			.then((r) => r[0]);

		expect(userSettings).toBeDefined();
		expect(userSettings?.organizationId).not.toBeNull();
	});

	it("usuário criado via testUtils mantém role explícita quando não é o primeiro usuário", async () => {
		const runtime = getAuthTestRuntime();
		const authClient = getAuthTestClient();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@testdomain.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "plain@testdomain.com",
			role: "user",
		});
		await authClient.saveUser(user);

		const savedUser = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "plain@testdomain.com"))
			.then((r) => r[0]);

		expect(savedUser?.role).toBe("user");
	});
});

describe("hook.before — bloqueio de signup após primeiro usuário", () => {
	it("bloqueia signup para segundo usuário", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const first = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "first@testdomain.com",
		});
		await authClient.saveUser(first);

		const res = await runtime.app.request("/v1/auth/sign-up/email", {
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
