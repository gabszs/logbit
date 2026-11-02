import type { Attributes } from "@opentelemetry/api";
import {
	ATTR_DB_SYSTEM_NAME,
	ATTR_NETWORK_PEER_ADDRESS,
	ATTR_NETWORK_PEER_PORT,
	ATTR_SERVER_ADDRESS,
	ATTR_SERVER_PORT,
} from "@opentelemetry/semantic-conventions";
import type { BunRedisClientInstance } from "./types";

// Semantic convention for db.namespace (database index)
export const ATTR_DB_NAMESPACE = "db.namespace";

export function getClientAttributes(
	client: BunRedisClientInstance,
): Attributes {
	const attributes: Attributes = {
		[ATTR_DB_SYSTEM_NAME]: "redis",
	};

	const options = client.options || (client as any)._otel_options;

	// Extract from options or stored connection metadata
	if (options) {
		// Extract db.namespace (database index)
		if (options.db !== undefined) {
			attributes[ATTR_DB_NAMESPACE] = String(options.db);
		}

		if (options.socket) {
			const host = options.socket.host || "localhost";
			const port = options.socket.port || 6379;

			attributes[ATTR_SERVER_ADDRESS] = host;
			attributes[ATTR_SERVER_PORT] = port;
			attributes[ATTR_NETWORK_PEER_ADDRESS] = host;
			attributes[ATTR_NETWORK_PEER_PORT] = port;
		} else if (options.url) {
			try {
				const url = new URL(options.url);
				attributes[ATTR_SERVER_ADDRESS] = url.hostname;
				attributes[ATTR_SERVER_PORT] = Number.parseInt(url.port, 10) || 6379;
				attributes[ATTR_NETWORK_PEER_ADDRESS] = url.hostname;
				attributes[ATTR_NETWORK_PEER_PORT] =
					Number.parseInt(url.port, 10) || 6379;

				// Extract db index from URL if not already set
				if (attributes[ATTR_DB_NAMESPACE] === undefined) {
					const path = url.pathname.slice(1);
					if (path && !Number.isNaN(Number.parseInt(path, 10))) {
						attributes[ATTR_DB_NAMESPACE] = path;
					}
				}
			} catch {
				// Fallback
			}
		}
	}

	return attributes;
}
