import { createClient as createWebClickhouseClient } from "@clickhouse/client-web";
import {
	GenericContainer,
	type StartedTestContainer,
	Wait,
} from "testcontainers";
import { createClickhouseClient } from "@/integrations/clickhouse";
import { getIntegrationTestRuntime } from "../connections/helpers";

type ProxyClickhouseState = {
	container: StartedTestContainer;
	baseUrl: string;
};

export type ProxyClickhouseTableSeed = {
	database: string;
	table: string;
	columnsSql: string;
	orderBy?: string;
	rows?: Array<Record<string, unknown>>;
};

type ProxyConnectionConfig = {
	url: string;
	database: string | null;
	username: string;
	password: string | null;
	name?: string;
	isActive?: boolean;
};

let state: ProxyClickhouseState | null = null;
let adminClient: ReturnType<typeof createClickhouseClient> | null = null;

function requireState() {
	if (state == null) {
		throw new Error(
			"ClickHouse proxy test container is not initialized. Did you call setupProxyTestLifecycle()?",
		);
	}
	return state;
}

function makeTestName(prefix: string) {
	return `${prefix}_${Bun.randomUUIDv7().replaceAll("-", "_")}`;
}

function quoteIdentifier(identifier: string) {
	return `\`${identifier.replaceAll("`", "``")}\``;
}

export async function setupProxyTestLifecycle() {
	const container = await new GenericContainer(
		"clickhouse/clickhouse-server:25.3",
	)
		.withEnvironment({
			CLICKHOUSE_USER: "default",
			CLICKHOUSE_PASSWORD: "clickhouse",
			CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: "1",
		})
		.withExposedPorts(8123)
		.withWaitStrategy(Wait.forHttp("/ping", 8123))
		.withStartupTimeout(120_000)
		.start();

	const host = container.getHost();
	const port = container.getMappedPort(8123);
	state = {
		container,
		baseUrl: `http://${host}:${port}`,
	};
}

export async function teardownProxyTestLifecycle() {
	if (adminClient) {
		await adminClient.close();
		adminClient = null;
	}
	if (state) {
		await state.container.stop();
		state = null;
	}
}

export function getProxyClickhouseBaseUrl() {
	return requireState().baseUrl;
}

export function createProxyClickhouseAdminClient() {
	if (adminClient) {
		return adminClient;
	}
	const baseUrl = getProxyClickhouseBaseUrl();
	adminClient = createClickhouseClient({
		url: baseUrl,
		database: "default",
		username: "default",
		password: "clickhouse",
	});
	return adminClient;
}

export function createProxyClickhouseClient(
	connectionId: string,
	sessionHeaders: Headers,
) {
	const runtime = getIntegrationTestRuntime();
	const proxyPrefix = `/v1/proxy/connections/${connectionId}`;

	return createWebClickhouseClient({
		url: runtime.settings.HOSTNAME,
		fetch: async (input, init) => {
			const requestUrl = new URL(input.toString());
			requestUrl.pathname = proxyPrefix + requestUrl.pathname;

			const headers = new Headers(init?.headers);
			for (const key of ["authorization", "cookie"]) {
				const value = sessionHeaders.get(key);
				if (value != null) {
					headers.set(key, value);
				}
			}

			return await runtime.app.request(
				`${requestUrl.pathname}${requestUrl.search}`,
				{
					method: init?.method ?? "GET",
					headers,
					body: init?.body as BodyInit | null | undefined,
				},
			);
		},
	});
}

export async function createProxyClickhouseConnection(
	headers: Headers,
	config: ProxyConnectionConfig,
) {
	const runtime = getIntegrationTestRuntime();
	const payload = {
		name: config.name ?? makeTestName("proxy-clickhouse"),
		type: "clickhouse" as const,
		isActive: config.isActive ?? true,
		config: {
			url: config.url,
			database: config.database,
			username: config.username,
			password: config.password ?? "",
		},
	};

	const res = await runtime.app.request("/v1/connections", {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
	});

	if (res.status !== 201) {
		throw new Error(`Failed to create clickhouse connection: ${res.status}`);
	}

	const body = (await res.json()) as {
		data: {
			id: string;
		};
	};
	return body.data.id;
}

export async function seedProxyClickhouseTable(seed: ProxyClickhouseTableSeed) {
	const client = createProxyClickhouseAdminClient();
	const databaseName = seed.database;
	const tableName = seed.table;
	const qualifiedTable = `${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}`;

	await client.command({
		query: `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(databaseName)}`,
	});
	await client.command({
		query: `DROP TABLE IF EXISTS ${qualifiedTable}`,
	});
	await client.command({
		query: `CREATE TABLE ${qualifiedTable} (${seed.columnsSql}) ENGINE = MergeTree ORDER BY (${seed.orderBy ?? "id"})`,
	});

	if (seed.rows && seed.rows.length > 0) {
		await client.insert({
			table: `${databaseName}.${tableName}`,
			values: seed.rows,
			format: "JSONEachRow",
		});
	}
}

export function createProxyTestDatabase(prefix: string) {
	return makeTestName(prefix);
}

export function createProxyTestTable(prefix: string) {
	return makeTestName(prefix);
}
