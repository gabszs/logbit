import { describe, expect, it } from "bun:test";
import {
	createAuthContext,
	createOrpcHttpClient,
	expectUnauthorizedError,
	setupOrpcTestLifecycle,
} from "./helpers";

describe("oRPC Settings over HTTP", () => {
	setupOrpcTestLifecycle();

	it("settings.get returns user settings for authenticated user", async () => {
		const ctx = await createAuthContext("settings-http-get@example.com");
		const client = createOrpcHttpClient(ctx.headers);

		const settings = await client.settings.get();

		expect(typeof settings.theme).toBe("string");
		expect("organizationId" in settings).toBe(true);
		expect("sourceId" in settings).toBe(true);
		expect("integrationId" in settings).toBe(true);
	});

	it("settings.get returns UNAUTHORIZED without session", async () => {
		const client = createOrpcHttpClient();
		await expectUnauthorizedError(client.settings.get());
	});

	it("settings.update supports partial updates without overwriting other fields", async () => {
		const ctx = await createAuthContext("settings-http-update@example.com");
		const client = createOrpcHttpClient(ctx.headers);

		const sourceId = Bun.randomUUIDv7();
		const integrationId = Bun.randomUUIDv7();
		const firstUpdate = await client.settings.update({
			theme: "dark",
			sourceId,
			integrationId,
		});

		expect(firstUpdate.theme).toBe("dark");
		expect(firstUpdate.sourceId).toBe(sourceId);
		expect(firstUpdate.integrationId).toBe(integrationId);

		await client.settings.update({ theme: "light" });
		const afterSecondUpdate = await client.settings.get();
		expect(afterSecondUpdate.theme).toBe("light");
		expect(afterSecondUpdate.sourceId).toBe(sourceId);
		expect(afterSecondUpdate.integrationId).toBe(integrationId);
	});

	it("settings.update validates payload for invalid UUID", async () => {
		const ctx = await createAuthContext("settings-http-invalid@example.com");
		const client = createOrpcHttpClient(ctx.headers);

		await expect(
			client.settings.update({ sourceId: "not-a-uuid" } as never),
		).rejects.toBeDefined();
	});
});
