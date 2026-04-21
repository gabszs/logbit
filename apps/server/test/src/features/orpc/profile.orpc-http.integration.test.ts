import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { users } from "@/db/models/authModels";
import {
	createAdditionalSession,
	createAuthContext,
	createOrpcHttpClient,
	expectUnauthorizedError,
	setupOrpcTestLifecycle,
} from "./helpers";

const { db } = await import("@/db");

describe("oRPC Profile over HTTP", () => {
	setupOrpcTestLifecycle();

	it("profile.get returns current user and blocks unauthenticated access", async () => {
		const ctx = await createAuthContext("profile-http-get@example.com");
		const authedClient = createOrpcHttpClient(ctx.headers);
		const anonymousClient = createOrpcHttpClient();

		const profile = await authedClient.profile.get();
		expect(profile?.id).toBe(ctx.userId);
		expect(profile?.email).toBe("profile-http-get@example.com");

		await expectUnauthorizedError(anonymousClient.profile.get());
	});

	it("profile.update persists user changes", async () => {
		const ctx = await createAuthContext("profile-http-update@example.com");
		const client = createOrpcHttpClient(ctx.headers);
		const image = "https://example.com/avatar.png";

		const updated = await client.profile.update({
			name: "Updated Name",
			image,
		});
		expect(updated?.name).toBe("Updated Name");
		expect(updated?.image).toBe(image);

		const [row] = await db
			.select({ name: users.name, image: users.image })
			.from(users)
			.where(eq(users.id, ctx.userId))
			.limit(1);

		expect(row?.name).toBe("Updated Name");
		expect(row?.image).toBe(image);
	});

	it("profile.update validates payload", async () => {
		const ctx = await createAuthContext("profile-http-invalid@example.com");
		const client = createOrpcHttpClient(ctx.headers);

		await expect(
			client.profile.update({ name: "" } as never),
		).rejects.toBeDefined();
	});

	it("profile.listSessions lists active sessions and revokeSession removes a valid token", async () => {
		const ctx = await createAuthContext("profile-http-sessions@example.com");
		const client = createOrpcHttpClient(ctx.headers);
		const secondSession = await createAdditionalSession(ctx.userId);

		const before = await client.profile.listSessions();
		expect(Array.isArray(before)).toBe(true);
		expect(before.some((session) => session.token === secondSession.token)).toBe(
			true,
		);

		const revoke = await client.profile.revokeSession({
			token: secondSession.token,
		});
		expect(revoke.success).toBe(true);

		const after = await client.profile.listSessions();
		expect(after.some((session) => session.token === secondSession.token)).toBe(
			false,
		);
	});

	it("profile.revokeSession is idempotent for invalid token and blocks unauthenticated users", async () => {
		const ctx = await createAuthContext("profile-http-revoke-invalid@example.com");
		const client = createOrpcHttpClient(ctx.headers);
		const anonymousClient = createOrpcHttpClient();

		await expect(
			client.profile.revokeSession({ token: "invalid-token" }),
		).resolves.toEqual({ success: true });
		await expectUnauthorizedError(
			anonymousClient.profile.revokeSession({ token: Bun.randomUUIDv7() }),
		);
	});
});
