import { createClient } from "@clickhouse/client";
import type { ClickhouseConfig } from "./schemas";

export function createClickhouseClient(config: ClickhouseConfig) {
	return createClient({
		host: config.host,
		database: config.database,
		username: config.username,
		password: config.password,
	});
}
