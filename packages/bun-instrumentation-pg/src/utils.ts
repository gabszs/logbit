import type { Attributes } from "@opentelemetry/api";
import type { BunSQLInstance, BunSQLOptions } from "./types";

// Semantic Conventions v1.40.0+
export const ATTR_DB_SYSTEM_NAME = "db.system.name";
export const ATTR_DB_NAMESPACE = "db.namespace";
export const ATTR_SERVER_ADDRESS = "server.address";
export const ATTR_SERVER_PORT = "server.port";
export const ATTR_DB_USER = "db.user";
export const ATTR_DB_OPERATION_NAME = "db.operation.name";
export const ATTR_DB_QUERY_TEXT = "db.query.text";
export const ATTR_ERROR_TYPE = "error.type";

export function getClientAttributes(sql: BunSQLInstance): Attributes {
	const options = sql.options ?? {};
	let database = options.database;
	let hostname = options.hostname;
	let port = options.port;
	let username = options.username;

	if (options.url && (!hostname || !port || !database || !username)) {
		try {
			const parsed = new URL(options.url);
			if (!hostname) hostname = parsed.hostname;
			if (!port && parsed.port) port = Number.parseInt(parsed.port, 10);
			if (!database && parsed.pathname.length > 1) {
				database = parsed.pathname.slice(1);
			}
			if (!username && parsed.username) username = parsed.username;
		} catch {
			// ignore URL parse errors
		}
	}

	return {
		[ATTR_DB_SYSTEM_NAME]: "postgresql",
		[ATTR_DB_NAMESPACE]: database,
		[ATTR_SERVER_ADDRESS]: hostname,
		[ATTR_SERVER_PORT]: port,
		[ATTR_DB_USER]: username,
	};
}

export function parseNormalizedOperationName(
	queryText: string,
): string | undefined {
	if (!queryText) return undefined;
	const trimmedQuery = queryText.trim();
	if (!trimmedQuery) return undefined;

	const indexOfFirstSpace = trimmedQuery.indexOf(" ");
	let sqlCommand =
		indexOfFirstSpace === -1
			? trimmedQuery
			: trimmedQuery.slice(0, indexOfFirstSpace);

	sqlCommand = sqlCommand.toUpperCase();
	return sqlCommand.endsWith(";") ? sqlCommand.slice(0, -1) : sqlCommand;
}

export function extractDatabaseName(
	options: BunSQLOptions | undefined,
): string | undefined {
	if (options?.database) {
		return options.database;
	}
	if (options?.url) {
		try {
			const url = new URL(options.url);
			const pathname = url.pathname;
			return pathname.slice(1) || undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}
