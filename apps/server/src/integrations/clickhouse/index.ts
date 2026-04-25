import { type ClickHouseClient, createClient } from "@clickhouse/client";
import type { ClickhouseConfig } from "./schemas";

export type ClickhouseClient = ClickHouseClient;

export function createClickhouseClient(
	config: ClickhouseConfig,
): ClickhouseClient {
	return createClient({
		host: config.host,
		database: config.database ?? undefined,
		username: config.username,
		password: config.password ?? undefined,
	});
}
