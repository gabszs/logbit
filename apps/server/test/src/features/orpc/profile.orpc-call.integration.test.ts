import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { users } from "@/db/models/authModels";
import {
	createAdditionalSession,
	createAnonymousCallContext,
	createAuthContext,
	createCallContextFromHeaders,
	expectUnauthorizedError,
	getOrpcRouters,
	getOrpcTestRuntime,
	setupOrpcTestLifecycle,
} from "./helpers";

describe("oRPC Profile via call()", () => {
	setupOrpcTestLifecycle();

	it("profile.get returns current user and blocks unauthenticated context", async () => {
		const ctx = await createAuthContext("profile-call-get@example.com");
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const anonymousContext = createAnonymousCallContext();
		const profileRouter = getOrpcRouters().profile;

		const profile = await call(profileRouter.get, undefined, {
			context: callContext,
		});
		expect(profile?.id).toBe(ctx.userId);
		expect(profile?.email).toBe("profile-call-get@example.com");

		await expectUnauthorizedError(
			call(profileRouter.get, undefined, { context: anonymousContext }),
		);
	});

	it("profile.update persists user changes", async () => {
		const ctx = await createAuthContext("profile-call-update@example.com");
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const image = "https://example.com/new-avatar.png";
		const profileRouter = getOrpcRouters().profile;

		await call(
			profileRouter.update,
			{
				name: "Call Updated Name",
				image,
			},
			{ context: callContext },
		);

		const runtime = getOrpcTestRuntime();
		const [row] = await runtime.db
			.select({ name: users.name, image: users.image })
			.from(users)
			.where(eq(users.id, ctx.userId))
			.limit(1);

		expect(row?.name).toBe("Call Updated Name");
		expect(row?.image).toBe(image);
	});

	it("profile.update validates payload", async () => {
		const ctx = await createAuthContext("profile-call-invalid@example.com");
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const profileRouter = getOrpcRouters().profile;

		await expect(
			call(profileRouter.update, { name: "" } as never, {
				context: callContext,
			}),
		).rejects.toBeDefined();
	});

	it("profile.listSessions and profile.revokeSession work for valid token", async () => {
		const ctx = await createAuthContext("profile-call-sessions@example.com");
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const secondSession = await createAdditionalSession(ctx.userId);
		const profileRouter = getOrpcRouters().profile;

		const before = await call(profileRouter.listSessions, undefined, {
			context: callContext,
		});
		expect(Array.isArray(before)).toBe(true);
		expect(
			before.some((session) => session.token === secondSession.token),
		).toBe(true);

		const revoke = await call(
			profileRouter.revokeSession,
			{ token: secondSession.token },
			{ context: callContext },
		);
		expect(revoke.success).toBe(true);

		const after = await call(profileRouter.listSessions, undefined, {
			context: callContext,
		});
		expect(after.some((session) => session.token === secondSession.token)).toBe(
			false,
		);
	});

	it("profile.revokeSession is idempotent for invalid token and blocks unauthenticated users", async () => {
		const ctx = await createAuthContext(
			"profile-call-revoke-invalid@example.com",
		);
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const anonymousContext = createAnonymousCallContext();
		const profileRouter = getOrpcRouters().profile;

		await expect(
			call(
				profileRouter.revokeSession,
				{ token: "invalid-token" },
				{ context: callContext },
			),
		).resolves.toEqual({ success: true });

		await expectUnauthorizedError(
			call(
				profileRouter.revokeSession,
				{ token: Bun.randomUUIDv7() },
				{ context: anonymousContext },
			),
		);
	});
});
