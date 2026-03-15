import { createExecutionContext, env } from "cloudflare:test";
import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../../src/index";
import { addProvider } from "../../fixtures";

describe("Test the providers route with D1 database", () => {
	const ctx = createExecutionContext();
	const client = testClient(app, env, ctx);
	console.log("D1", env.D1);

	let id = crypto.randomUUID();
	const newProvider = {
		id: id,
		name: "My Provider",
		link: "https://example.com/rss",
	};

	beforeEach(async () => {
		await addProvider(env.D1, newProvider);
	});

	it("create-new-provider-POST-should-return-204-NoContent", async () => {
		const res = await client.v1.providers.$post({
			json: newProvider,
		});
		expect(res.status).toBe(204);
	});

	it("fetch-all-providers-GET-should-return-200-ok", async () => {
		const res = await client.v1.providers.$get();
		expect(res.status).toBe(200);

		const data = await res.json();
		id = data.data[0].id;

		expect(data.data.length).toBe(1);
		expect(data.data[0].name).toBeDefined();
		expect(data.metadata).toBeDefined();
	});

	it("fetch-provider-by-id-GET-should-return-200-ok", async () => {
		const res = await client.v1.providers[":id"].$get({
			param: { id },
		});
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data.id).toBe(id);
		expect(data.name).toBeDefined();
		expect(data.link).toBeDefined();
		expect(data.createdAt).toBeDefined();
		expect(data.updatedAt).toBeDefined();
	});

	it("update-provider-PUT-should-return-200-ok", async () => {
		const updatedProvider = {
			name: "Updated Provider",
			link: "https://updated.com/rss",
		};
		const res = await client.v1.providers[":id"].$put({
			param: { id },
			json: updatedProvider,
		});
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.name).toBe(updatedProvider.name);
		expect(data.link).toBe(updatedProvider.link);
		expect(data.updatedAt).not.toBeUndefined();
	});

	it("update-provider-PUT-with-no-changes-should-return-422", async () => {
		const getRes = await client.v1.providers[":id"].$get({
			param: { id },
		});
		expect(getRes.status).toBe(200);

		const provider = await getRes.json();
		const sameData = {
			name: provider.name,
			link: provider.link,
		};

		const updateRes = await client.v1.providers[":id"].$put({
			param: { id },
			json: sameData,
		});
		expect(updateRes.status).toBe(422);
	});

	it("delete-provider-DELETE-should-return-204-NoContent", async () => {
		const res = await client.v1.providers[":id"].$delete({
			param: { id },
		});
		expect(res.status).toBe(204);
	});

	it("fetch-deleted-provider-GET-should-return-404-not-found", async () => {
		const res = await client.v1.provider11[":id"].$get({
			// wrong path
			param: { id },
		});
		expect(res.status).toBe(404);
	});
});
