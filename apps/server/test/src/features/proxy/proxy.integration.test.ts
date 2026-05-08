import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	createAuthContextWithActiveOrganization,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "../connections/helpers";
import {
	createProxyClickhouseClient,
	createProxyClickhouseConnection,
	createProxyTestDatabase,
	createProxyTestTable,
	getProxyClickhouseBaseUrl,
	seedProxyClickhouseTable,
	setupProxyTestLifecycle,
	teardownProxyTestLifecycle,
} from "./helpers";

setupIntegrationTestLifecycle();

beforeAll(async () => {
	await setupProxyTestLifecycle();
}, 120_000);

afterAll(async () => {
	await teardownProxyTestLifecycle();
}, 120_000);

type JsonRows = {
	data: Array<Record<string, unknown>>;
	rows?: number;
	meta?: Array<{ name: string; type: string }>;
};

async function queryJson(
	client: ReturnType<typeof createProxyClickhouseClient>,
	query: string,
	options: {
		httpHeaders?: Record<string, string>;
	} = {},
) {
	const result = await client.query({
		query,
		format: "JSON",
		...(options.httpHeaders
			? { http_headers: options.httpHeaders }
			: undefined),
	});
	return (await result.json()) as JsonRows;
}

async function createProxyFixture(ctxHeaders: Headers) {
	const database = createProxyTestDatabase("proxy_db");
	const table = createProxyTestTable("proxy_table");
	const connectionId = await createProxyClickhouseConnection(ctxHeaders, {
		url: getProxyClickhouseBaseUrl(),
		database,
		username: "default",
		password: "clickhouse",
	});
	const client = createProxyClickhouseClient(connectionId, ctxHeaders);

	return {
		client,
		connectionId,
		database,
		table,
	};
}

describe("ClickHouse proxy integration", () => {
	it("rejects invalid connection ids", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-invalid-connection-id@example.com",
		);

		const res = await requestWithAuth("/v1/proxy/connections/not-a-uuid", {
			method: "GET",
			headers: ctx.headers,
		});

		expect(res.status).toBe(400);
	});

	it("returns 404 when connection is missing", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-missing-connection@example.com",
		);

		const res = await requestWithAuth(
			`/v1/proxy/connections/${Bun.randomUUIDv7()}?query=SHOW%20DATABASES`,
			{
				method: "GET",
				headers: ctx.headers,
			},
		);

		expect(res.status).toBe(404);
	});

	it("returns 502 when upstream ClickHouse is unreachable", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-upstream-down@example.com",
		);
		const database = createProxyTestDatabase("proxy_unreachable_db");
		const connectionId = await createProxyClickhouseConnection(ctx.headers, {
			url: "http://127.0.0.1:65534",
			database,
			username: "default",
			password: "clickhouse",
		});

		const res = await requestWithAuth(
			`/v1/proxy/connections/${connectionId}?query=SHOW%20DATABASES`,
			{
				method: "GET",
				headers: ctx.headers,
			},
		);

		expect(res.status).toBe(502);
	});

	it("covers SHOW DATABASES", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-show-databases@example.com",
		);
		const { client, database, table } = await createProxyFixture(ctx.headers);

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, name String",
		});

		const result = await queryJson(client, "SHOW DATABASES");
		const databaseNames = result.data.map((row) => String(row.name));

		expect(databaseNames).toContain(database);
		expect(databaseNames).toContain("default");
	});

	it("covers SHOW TABLES preset branches", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-show-tables@example.com",
		);
		const { client, database, table } = await createProxyFixture(ctx.headers);
		const defaultTable = createProxyTestTable("proxy_default_table");

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, name String",
		});
		await seedProxyClickhouseTable({
			database: "default",
			table: defaultTable,
			columnsSql: "id UInt64, name String",
		});

		const scopedResult = await queryJson(
			client,
			`SHOW TABLES FROM ${database}`,
		);
		expect(scopedResult.data.map((row) => String(row.name))).toContain(table);

		const defaultScopeResult = await queryJson(
			client,
			"SELECT database, name, engine FROM system.tables WHERE database = 'default' ORDER BY database, name LIMIT 200",
		);
		expect(
			defaultScopeResult.data.some(
				(row) =>
					row.database === "default" &&
					row.name === defaultTable &&
					row.engine === "MergeTree",
			),
		).toBe(true);
	});

	it("covers DESCRIBE TABLE preset branches", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-describe-table@example.com",
		);
		const { client, database, table } = await createProxyFixture(ctx.headers);

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, name String, score Float64",
		});

		const described = await queryJson(
			client,
			`DESCRIBE TABLE ${database}.${table}`,
		);
		expect(
			described.data.some((row) => row.name === "id" && row.type === "UInt64"),
		).toBe(true);
		expect(
			described.data.some(
				(row) => row.name === "score" && row.type === "Float64",
			),
		).toBe(true);

		const fallbackDescribe = await queryJson(
			client,
			"DESCRIBE TABLE system.numbers",
		);
		expect(
			fallbackDescribe.data.some(
				(row) => row.name === "number" && row.type === "UInt64",
			),
		).toBe(true);
	});

	it("covers Server info preset and proxy guards", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-server-info@example.com",
		);
		const { client, database, table } = await createProxyFixture(ctx.headers);

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, name String",
		});

		const result = await queryJson(
			client,
			"SELECT version() AS version, uptime() AS uptime_seconds, timezone() AS timezone, currentDatabase() AS current_database",
			{
				httpHeaders: {
					"X-ClickHouse-Database": "spoofed-db",
					Authorization: "Bearer spoofed-token",
				},
			},
		);

		const row = result.data[0];
		expect(typeof row.version).toBe("string");
		expect(Number(row.uptime_seconds)).toBeGreaterThan(0);
		expect(typeof row.timezone).toBe("string");
		expect(row.current_database).toBe(database);
	});

	it("normalizes saved ClickHouse URL to base URL", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-url-normalization@example.com",
		);
		const database = createProxyTestDatabase("proxy_url_db");
		const table = createProxyTestTable("proxy_url_table");
		const baseUrl = getProxyClickhouseBaseUrl();
		const noisyUrl = `${baseUrl}/${database}?database=shadow_db`;
		const connectionId = await createProxyClickhouseConnection(ctx.headers, {
			url: noisyUrl,
			database,
			username: "default",
			password: "clickhouse",
		});
		const client = createProxyClickhouseClient(connectionId, ctx.headers);

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, name String",
			rows: [{ id: 1, name: "normalized" }],
		});

		const response = await requestWithAuth(`/v1/connections/${connectionId}`, {
			method: "GET",
			headers: ctx.headers,
		});

		expect(response.status).toBe(200);
		const connection = (await response.json()) as {
			config: { url: string; database: string | null };
		};
		expect(connection.config.url).toBe(baseUrl);
		expect(connection.config.database).toBe(database);

		const result = await queryJson(client, "SHOW DATABASES");
		expect(result.data.map((row) => String(row.name))).toContain(database);
	});

	it("covers Active processes preset", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-active-processes@example.com",
		);
		const { client, database, table } = await createProxyFixture(ctx.headers);

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, name String",
		});

		const result = await queryJson(
			client,
			"SELECT query_id, user, elapsed, read_rows, memory_usage, query FROM system.processes WHERE is_cancelled = 0",
		);

		expect(result.data.length).toBeGreaterThan(0);
		expect(
			result.data.some(
				(row) =>
					typeof row.query_id === "string" &&
					typeof row.user === "string" &&
					typeof row.query === "string",
			),
		).toBe(true);
	});

	it("covers Stress test preset", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-stress-test@example.com",
		);
		const { client, database, table } = await createProxyFixture(ctx.headers);

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, name String",
		});

		const result = await queryJson(
			client,
			"SELECT number, toString(number) AS str, number * 2 AS doubled FROM system.numbers LIMIT 50000",
		);

		expect(result.rows ?? result.data.length).toBe(50000);
		expect(result.data[0]).toMatchObject({
			number: "0",
			str: "0",
			doubled: "0",
		});
		expect(result.data[49999]).toMatchObject({
			number: "49999",
			str: "49999",
			doubled: "99998",
		});
	});

	it("supports proxy writes and ALTER TABLE", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"proxy-write-alter@example.com",
		);
		const { client, database, table } = await createProxyFixture(ctx.headers);

		await seedProxyClickhouseTable({
			database,
			table,
			columnsSql: "id UInt64, message String",
		});

		await client.insert({
			table: `${database}.${table}`,
			values: [
				{ id: 1, message: "first" },
				{ id: 2, message: "second" },
			],
			format: "JSONEachRow",
		});

		await client.command({
			query: `ALTER TABLE ${database}.${table} ADD COLUMN status String DEFAULT 'new'`,
		});

		const described = await queryJson(
			client,
			`DESCRIBE TABLE ${database}.${table}`,
		);
		expect(
			described.data.some(
				(row) => row.name === "status" && row.type === "String",
			),
		).toBe(true);

		const rows = await queryJson(
			client,
			`SELECT id, message, status FROM ${database}.${table} ORDER BY id`,
		);
		expect(rows.data).toEqual([
			{ id: "1", message: "first", status: "new" },
			{ id: "2", message: "second", status: "new" },
		]);
	});
});
