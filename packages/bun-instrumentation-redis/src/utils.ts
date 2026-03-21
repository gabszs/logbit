import type { Attributes } from "@opentelemetry/api";
import {
	ATTR_DB_SYSTEM_NAME,
	ATTR_SERVER_ADDRESS,
	ATTR_SERVER_PORT,
} from "@opentelemetry/semantic-conventions";

export function getClientAttributes(client: any): Attributes {
	const attributes: Attributes = {
		[ATTR_DB_SYSTEM_NAME]: "redis",
	};

	// Bun's RedisClient stores options in a private-ish way or we can extract from the instance
	if (client.options) {
		if (client.options.socket) {
			attributes[ATTR_SERVER_ADDRESS] =
				client.options.socket.host || "localhost";
			attributes[ATTR_SERVER_PORT] = client.options.socket.port || 6379;
		} else if (client.options.url) {
			try {
				const url = new URL(client.options.url);
				attributes[ATTR_SERVER_ADDRESS] = url.hostname;
				attributes[ATTR_SERVER_PORT] = Number.parseInt(url.port, 10) || 6379;
			} catch {
				// Fallback
			}
		}
	}

	return attributes;
}
