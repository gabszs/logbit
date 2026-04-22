import z from "zod";
import { createClickhouseClient } from "./clickhouse";
import { ClickhouseConfigSchema } from "./clickhouse/schemas";
import { createCloudflareClient } from "./cloudflare";
import { CloudflareConfigSchema } from "./cloudflare/schemas";
import { createResendClient } from "./resend";
import { ResendConfigSchema } from "./resend/schemas";

export const supportedIntegrationTypes = [
	"resend",
	"cloudflare",
	"clickhouse",
] as const;

export const supportedIntegrationSchemas = z.union([
	ResendConfigSchema,
	CloudflareConfigSchema,
	ClickhouseConfigSchema,
]);

export type SupportedIntegrationKind = (typeof supportedIntegrationTypes)[number];
export type SupportedIntegrationSchemasTypes = z.infer<
	typeof supportedIntegrationSchemas
>;

export function createConnectionClient(connection: {
	type: SupportedIntegrationKind;
	config: unknown;
}) {
	switch (connection.type) {
		case "resend":
			return createResendClient(ResendConfigSchema.parse(connection.config));
		case "cloudflare":
			return createCloudflareClient(
				CloudflareConfigSchema.parse(connection.config),
			);
		case "clickhouse":
			return createClickhouseClient(
				ClickhouseConfigSchema.parse(connection.config),
			);
		default:
			throw new Error(
				`Unsupported connection type: "${connection.type}"`,
			);
	}
}
