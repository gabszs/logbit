import { z } from "zod";
import { ClickhouseConfigSchema } from "./clickhouse/schemas";
import { CloudflareConfigSchema } from "./cloudflare/schemas";
import { ResendConfigSchema } from "./resend/schemas";

type IntegrationRegistryEntry = {
	configSchema: z.ZodType;
};

const defineIntegrationRegistry = <
	const TRegistry extends Record<string, IntegrationRegistryEntry>,
>(
	registry: TRegistry,
) => registry;

export const integrationRegistry = defineIntegrationRegistry({
	resend: {
		configSchema: ResendConfigSchema,
	},
	cloudflare: {
		configSchema: CloudflareConfigSchema,
	},
	clickhouse: {
		configSchema: ClickhouseConfigSchema,
	},
});

export type SupportedIntegrationKind = keyof typeof integrationRegistry;

export type IntegrationConfigByKind = {
	resend: z.infer<typeof ResendConfigSchema>;
	cloudflare: z.infer<typeof CloudflareConfigSchema>;
	clickhouse: z.infer<typeof ClickhouseConfigSchema>;
};

export type IntegrationConnectionInput = {
	[TKind in SupportedIntegrationKind]: {
		type: TKind;
		config: IntegrationConfigByKind[TKind];
	};
}[SupportedIntegrationKind];

export const supportedIntegrationTypes = Object.keys(integrationRegistry) as [
	SupportedIntegrationKind,
	...SupportedIntegrationKind[],
];

export const supportedIntegrationSchemas = z.union([
	ResendConfigSchema,
	CloudflareConfigSchema,
	ClickhouseConfigSchema,
]);

export type SupportedIntegrationSchemasTypes = z.infer<
	typeof supportedIntegrationSchemas
>;

export function parseIntegrationConfig(
	type: SupportedIntegrationKind,
	config: unknown,
): IntegrationConfigByKind[typeof type] {
	return integrationRegistry[type].configSchema.parse(config);
}

export function parseIntegrationConnection(connection: {
	type: SupportedIntegrationKind;
	config: unknown;
}): IntegrationConnectionInput {
	switch (connection.type) {
		case "resend":
			return {
				type: "resend",
				config: integrationRegistry.resend.configSchema.parse(
					connection.config,
				),
			};
		case "cloudflare":
			return {
				type: "cloudflare",
				config: integrationRegistry.cloudflare.configSchema.parse(
					connection.config,
				),
			};
		case "clickhouse":
			return {
				type: "clickhouse",
				config: integrationRegistry.clickhouse.configSchema.parse(
					connection.config,
				),
			};
		default:
			throw new Error("Unsupported connection type");
	}
}
