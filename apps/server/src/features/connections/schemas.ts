import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { models } from "@/db/models";
import { integrationRegistry } from "@/integrations/registry";
import { searchOptionsSchema } from "../../common/schemas/baseSchemas";

const ResendConfigSchema = integrationRegistry.resend.configSchema;
const CloudflareConfigSchema = integrationRegistry.cloudflare.configSchema;

export const testClickhouseConfigSchema = z.object({
	host: z.string().max(200),
	username: z.string().max(200),
	database: z.string().max(200).nullable().optional(),
	password: z.string().max(200).nullable().optional(),
});

export const baseConnectionSchema = createSelectSchema(
	models.connections,
).extend({
	name: z.string().min(1).max(255),
	isActive: z.boolean(),
});

export type ConnectionType = z.infer<typeof baseConnectionSchema>;

const connectionCommonSchema = baseConnectionSchema.omit({
	type: true,
	config: true,
});

const resendConnectionSchema = connectionCommonSchema.extend({
	type: z.literal("resend"),
	config: ResendConfigSchema,
});

const cloudflareConnectionSchema = connectionCommonSchema.extend({
	type: z.literal("cloudflare"),
	config: CloudflareConfigSchema,
});

const clickhouseConnectionSchema = connectionCommonSchema.extend({
	type: z.literal("clickhouse"),
	config: integrationRegistry.clickhouse.configSchema,
});

export const connectionSchema = z.discriminatedUnion("type", [
	resendConnectionSchema,
	cloudflareConnectionSchema,
	clickhouseConnectionSchema,
]);

export const connectionResponseSchema = baseConnectionSchema.extend({
	createdAt: z.date(),
	updatedAt: z.date(),
	config: z.union([
		clickhouseConnectionSchema.shape.config,
		cloudflareConnectionSchema.shape.config,
		resendConnectionSchema.shape.config,
	]),
});

const connectionCommonUpsertSchema = connectionCommonSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
});

const resendConnectionUpsertSchema = connectionCommonUpsertSchema.extend({
	type: z.literal("resend"),
	config: ResendConfigSchema,
});

const cloudflareConnectionUpsertSchema = connectionCommonUpsertSchema.extend({
	type: z.literal("cloudflare"),
	config: CloudflareConfigSchema,
});

const clickhouseConnectionUpsertSchema = connectionCommonUpsertSchema.extend({
	type: z.literal("clickhouse"),
	config: integrationRegistry.clickhouse.configSchema,
});

export const connectionTestResultSchema = z.object({
	success: z.boolean(),
	error: z.string().nullable(),
	data: z.record(z.string(), z.unknown()).nullable(),
});
export type ClickhouseConnectionTestInput = z.infer<
	typeof testClickhouseConfigSchema
>;
export type ConnectionTestResultType = z.infer<
	typeof connectionTestResultSchema
>;

export const connectionUpsertSchema = z
	.discriminatedUnion("type", [
		resendConnectionUpsertSchema,
		cloudflareConnectionUpsertSchema,
		clickhouseConnectionUpsertSchema,
	])
	.openapi("ConnectionUpsert");

const connectionConfigUpdateSchema = z.record(z.string(), z.unknown());

const partialConnectionFieldsSchema = connectionCommonUpsertSchema.partial();

type PartialConnectionUpdate = z.infer<typeof partialConnectionFieldsSchema> & {
	config?: z.infer<typeof connectionConfigUpdateSchema>;
};

export const connectionUpdateSchema = partialConnectionFieldsSchema
	.extend({
		config: connectionConfigUpdateSchema.optional(),
	})
	.strict()
	.superRefine((value: PartialConnectionUpdate, ctx: z.RefinementCtx) => {
		if (Object.keys(value).length === 0) {
			ctx.addIssue({
				code: "custom",
				message: "At least one field is required",
			});
		}
	});

export const connectionSuccessSchema = z
	.object({
		message: z.string().openapi({
			description: "Response message",
			example: "Connection successfully created",
		}),
		data: connectionResponseSchema,
		metadata: z.object({}).nullable(),
	})
	.openapi("ConnectionSuccess");

export const connectionListSuccessSchema = connectionSuccessSchema
	.extend({
		data: z.array(connectionResponseSchema),
		metadata: searchOptionsSchema.nullable(),
	})
	.openapi("ConnectionListSuccess");

export type ConnectionEntityType = z.infer<typeof connectionSchema>;
export type ConnectionResponseType = z.infer<typeof connectionResponseSchema>;
export type ConnectionListSuccessType = z.infer<
	typeof connectionListSuccessSchema
>;
export type ConnectionUpsertInput = z.infer<typeof connectionUpsertSchema>;
export type ConnectionUpdateInput = z.infer<typeof connectionUpdateSchema>;
