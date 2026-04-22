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
		AUTH_ALLOWED_EMAIL_DOMAINS: undefined,
	},
});

describe("POST /v1/auth/sign-up/email", () => {
	it("first user becomes admin with emailVerified=true", async () => {
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@example.com"))
			.then((r) => r[0]);

		expect(user).toBeDefined();
		expect(user?.role).toBe("admin");
		expect(user?.emailVerified).toBe(true);
	});

	it("first user gets a default organization as owner", async () => {
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@example.com"))
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by test setup
			.then((r) => r[0]!);

		const org = await runtime.db
			.select()
			.from(models.organizations)
			.limit(1)
			.then((r) => r[0]);

		expect(org).toBeDefined();
		expect(org?.slug).toContain("organization");

		const member = await runtime.db
			.select()
			.from(models.members)
			.where(eq(models.members.userId, user.id))
			.then((r) => r[0]);

		expect(member?.role).toBe("owner");
		expect(member?.organizationId).toBe(org?.id);
	});

	it("first user gets userSettings linked to the default organization", async () => {
		const runtime = getAuthTestRuntime();
		await runtime.auth.api.signUpEmail({
			body: {
				email: "admin@example.com",
				password: "password123",
				name: "Admin",
			},
		});

		const user = await runtime.db
			.select()
			.from(models.users)
			.where(eq(models.users.email, "admin@example.com"))
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by test setup
			.then((r) => r[0]!);

		const org = await runtime.db
			.select()
			.from(models.organizations)
			.limit(1)
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by test setup
			.then((r) => r[0]!);

		const userSettings = await runtime.db
			.select()
			.from(models.userSettings)
			.where(eq(models.userSettings.userId, user.id))
			.then((r) => r[0]);

		expect(userSettings).toBeDefined();
		expect(userSettings?.organizationId).toBe(org.id);
		expect(userSettings?.theme).toBe("system");
	});

	it("second user signup is blocked with FORBIDDEN", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const existing = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "first@example.com",
		});
		await authClient.saveUser(existing);

		await expect(
			runtime.auth.api.signUpEmail({
				body: {
					email: "second@example.com",
					password: "password123",
					name: "Second",
				},
			}),
		).rejects.toMatchObject({ statusCode: 403 });
	});
});
