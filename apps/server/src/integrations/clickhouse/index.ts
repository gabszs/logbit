import { type ClickHouseClient, createClient } from "@clickhouse/client";
import { normalizeClickhouseConfig } from "./config";
import type { ClickhouseConfigType } from "./schemas";

export type ClickhouseClient = ClickHouseClient;

export function createClickhouseClient(
	config: ClickhouseConfigType,
): ClickhouseClient {
	const normalizedConfig = normalizeClickhouseConfig(config);
	return createClient({
		url: normalizedConfig.url,
		database: normalizedConfig.database ?? undefined,
		username: normalizedConfig.username,
		password: normalizedConfig.password ?? undefined,
	});
}
