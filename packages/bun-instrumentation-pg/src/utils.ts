import type { Attributes } from "@opentelemetry/api";

// Semantic Conventions v1.40.0+
export const ATTR_DB_SYSTEM_NAME = "db.system.name";
export const ATTR_DB_NAMESPACE = "db.namespace";
export const ATTR_SERVER_ADDRESS = "server.address";
export const ATTR_SERVER_PORT = "server.port";
export const ATTR_DB_USER = "db.user";
export const ATTR_DB_OPERATION_NAME = "db.operation.name";
export const ATTR_DB_QUERY_TEXT = "db.query.text";
export const ATTR_ERROR_TYPE = "error.type";

export function getClientAttributes(sql: any): Attributes {
	const options = sql.options || {};
	return {
		[ATTR_DB_SYSTEM_NAME]: "postgresql",
		[ATTR_DB_NAMESPACE]: options.database,
		[ATTR_SERVER_ADDRESS]: options.hostname,
		[ATTR_SERVER_PORT]: options.port,
		[ATTR_DB_USER]: options.username,
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

export function extractDatabaseName(options: any): string | undefined {
	// Try to get from options.database first
	if (options?.database) {
		return options.database;
	}
	// Try to parse from connection string if available
	if (options?.url) {
		try {
			const url = new URL(options.url);
			const pathname = url.pathname;
			// Remove leading slash and get database name
			return pathname.slice(1) || undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}
