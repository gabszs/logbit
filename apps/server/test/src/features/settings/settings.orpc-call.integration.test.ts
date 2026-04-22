import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";
import {
	createAnonymousCallContext,
	createAuthContext,
	createCallContextFromHeaders,
	expectUnauthorizedError,
	getOrpcRouters,
	setupOrpcTestLifecycle,
} from "../../setup/orpc";

describe("oRPC Settings via call()", () => {
	setupOrpcTestLifecycle();

	it("settings.get returns user settings for authenticated context", async () => {
		const ctx = await createAuthContext("settings-call-get@example.com");
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const settingsRouter = getOrpcRouters().settings;

		const settings = await call(settingsRouter.get, undefined, {
			context: callContext,
		});

		expect(typeof settings.theme).toBe("string");
		expect("organizationId" in settings).toBe(true);
		expect("sourceId" in settings).toBe(true);
		expect("integrationId" in settings).toBe(true);
	});

	it("settings.get returns UNAUTHORIZED without session", async () => {
		const callContext = createAnonymousCallContext();
		const settingsRouter = getOrpcRouters().settings;

		await expectUnauthorizedError(
			call(settingsRouter.get, undefined, { context: callContext }),
		);
	});

	it("settings.update supports partial updates and persistence", async () => {
		const ctx = await createAuthContext("settings-call-update@example.com");
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const sourceId = Bun.randomUUIDv7();
		const integrationId = Bun.randomUUIDv7();
		const settingsRouter = getOrpcRouters().settings;

		await call(
			settingsRouter.update,
			{
				theme: "dark",
				sourceId,
				integrationId,
			},
			{ context: callContext },
		);

		await call(
			settingsRouter.update,
			{ theme: "light" },
			{ context: callContext },
		);
		const afterSecondUpdate = await call(settingsRouter.get, undefined, {
			context: callContext,
		});

		expect(afterSecondUpdate.theme).toBe("light");
		expect(afterSecondUpdate.sourceId).toBe(sourceId);
		expect(afterSecondUpdate.integrationId).toBe(integrationId);
	});

	it("settings.update validates payload for invalid UUID", async () => {
		const ctx = await createAuthContext("settings-call-invalid@example.com");
		const callContext = await createCallContextFromHeaders(ctx.headers);
		const settingsRouter = getOrpcRouters().settings;

		await expect(
			call(settingsRouter.update, { sourceId: "not-a-uuid" } as never, {
				context: callContext,
			}),
		).rejects.toBeDefined();
	});
});
