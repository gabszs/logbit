import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { models } from "@/db/models";
import { auth } from "@/lib/auth";
import { truncateAllTables } from "../../setup/db";

let auth_client: TestHelpers;

beforeAll(async () => {
	const ctx = await auth.$context;
	auth_client = ctx.test;
});

afterEach(async () => {
	await truncateAllTables();
});

describe("POST /v1/auth/sign-up/email", () => {
	it("first user becomes admin with emailVerified=true", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@example.com"))
			.then((r) => r[0]);

		expect(user).toBeDefined();
		expect(user?.role).toBe("admin");
		expect(user?.emailVerified).toBe(true);
	});

	it("first user gets a default organization as owner", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@example.com"))
			.then((r) => r[0]!);

		const org = await db
			.select()
			.from(models.organizations)
			.limit(1)
			.then((r) => r[0]);

		expect(org).toBeDefined();
		expect(org?.slug).toContain("organization");

		const member = await db
			.select()
			.from(models.members)
			.where(eq(models.members.userId, user.id))
			.then((r) => r[0]);

		expect(member?.role).toBe("owner");
		expect(member?.organizationId).toBe(org?.id);
	});

	it("first user gets userSettings linked to the default organization", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@example.com"))
			.then((r) => r[0]!);

		const org = await db
			.select()
			.from(models.organizations)
			.limit(1)
			.then((r) => r[0]!);

		const userSettings = await db
			.select()
			.from(models.userSettings)
			.where(eq(models.userSettings.userId, user.id))
			.then((r) => r[0]);

		expect(userSettings).toBeDefined();
		expect(userSettings?.organizationId).toBe(org.id);
		expect(userSettings?.theme).toBe("system");
	});

	it("second user signup is blocked with FORBIDDEN", async () => {
		// Garante que já existe um usuário no banco
		const existing = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "first@example.com",
		});
		await auth_client.saveUser(existing);

		await expect(
			auth.api.signUpEmail({
				body: {
					email: "second@example.com",
					password: "password123",
					name: "Second",
				},
			}),
		).rejects.toMatchObject({ statusCode: 403 });
	});
});
