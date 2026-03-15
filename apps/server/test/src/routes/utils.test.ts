import { env } from "cloudflare:test";
import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import app from "../../../src/index";

describe("Minimal test", () => {
	// const client = testClient(app, env)
	// app.fetch.showRoutes()
	it("should run without errors", () => {
		expect(true).toBe(true);
	});
});

describe("Test the providers route with D1 database", () => {
	const client = testClient(app, env);

	it("test-health", async () => {
		const res = await client.health.$get();
		const body = await res.json();
		const date = new Date(body.timestamp);

		expect(res.status).toBe(200);
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("string");
		expect(Number.isNaN(date.getTime())).toBe(false);
	});
});
