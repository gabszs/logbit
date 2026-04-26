import { type ClickHouseClient, createClient } from "@clickhouse/client";
import { normalizeClickhouseConfig } from "./config";
import type { ClickhouseConfig } from "./schemas";

export type ClickhouseClient = ClickHouseClient;

export function createClickhouseClient(
	config: ClickhouseConfig,
): ClickhouseClient {
	const normalizedConfig = normalizeClickhouseConfig(config);
	return createClient({
		host: normalizedConfig.host,
		database: normalizedConfig.database ?? undefined,
		username: normalizedConfig.username,
		password: normalizedConfig.password ?? undefined,
	});
}
