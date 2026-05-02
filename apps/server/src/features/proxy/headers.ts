import type { ClickhouseConfigType } from "@/integrations/clickhouse/schemas";

// Headers from the client request that must never reach ClickHouse.
// Auth and database are always replaced with the connection's saved config.
export const BLOCKED_REQUEST_HEADERS = new Set([
	"host",
	"x-clickhouse-user",
	"x-clickhouse-key",
	"x-clickhouse-database",
	"authorization",
	"cookie",
]);

// Hop-by-hop headers that must not be forwarded in the response.
// www-authenticate is also blocked: if ClickHouse returns 401, forwarding
// this header would trigger the browser's native Basic Auth dialog.
export const BLOCKED_RESPONSE_HEADERS = new Set([
	"transfer-encoding",
	"connection",
	"keep-alive",
	"upgrade",
	"proxy-authenticate",
	"proxy-authorization",
	"www-authenticate",
	"te",
	"trailers",
]);

export function buildForwardHeaders(
	inputHeaders: Headers,
	blockedHeaders: Set<string>,
) {
	const forwardHeaders = new Headers();
	for (const [key, value] of inputHeaders.entries()) {
		if (!blockedHeaders.has(key.toLowerCase())) {
			forwardHeaders.set(key, value);
		}
	}
	return forwardHeaders;
}

export function applyClickhouseConnectionHeaders(
	forwardHeaders: Headers,
	config: Pick<ClickhouseConfigType, "username" | "password" | "database">,
) {
	forwardHeaders.set("X-ClickHouse-User", config.username);
	if (config.password != null) {
		forwardHeaders.set("X-ClickHouse-Key", config.password);
	}
	if (config.database != null) {
		forwardHeaders.set("X-ClickHouse-Database", config.database);
	}
}
