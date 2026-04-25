import { type ClickhouseClient, createClickhouseClient } from "./clickhouse";
import { type CloudflareClient, createCloudflareClient } from "./cloudflare";
import type { IntegrationConnectionInput } from "./registry";
import { createResendClient, type ResendClient } from "./resend";

export type ConnectionClient =
	| ResendClient
	| CloudflareClient
	| ClickhouseClient;

export function createConnectionClient(
	connection: IntegrationConnectionInput,
): ConnectionClient {
	switch (connection.type) {
		case "resend":
			return createResendClient(connection.config);
		case "cloudflare":
			return createCloudflareClient(connection.config);
		case "clickhouse":
			return createClickhouseClient(connection.config);
		default:
			throw new Error("Unsupported connection type");
	}
}
