import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { models } from "@/db/models";
import { ClickhouseConfigSchema } from "@/integrations/clickhouse/schemas";
import { CloudflareConfigSchema } from "@/integrations/cloudflare/schemas";
import { ResendConfigSchema } from "@/integrations/resend/schemas";
import { searchOptionsSchema } from "../../common/schemas/baseSchemas";

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
	config: ClickhouseConfigSchema,
});

const connectionTypeConfigPairSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("resend"), config: ResendConfigSchema }),
	z.object({ type: z.literal("cloudflare"), config: CloudflareConfigSchema }),
	z.object({ type: z.literal("clickhouse"), config: ClickhouseConfigSchema }),
]);

export const connectionSchema = z.discriminatedUnion("type", [
	resendConnectionSchema,
	cloudflareConnectionSchema,
	clickhouseConnectionSchema,
]);

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
	config: ClickhouseConfigSchema,
});

export const connectionUpsertSchema = z
	.discriminatedUnion("type", [
		resendConnectionUpsertSchema,
		cloudflareConnectionUpsertSchema,
		clickhouseConnectionUpsertSchema,
	])
	.openapi("ConnectionUpsert");

const connectionTypeSchema = z.enum(["resend", "cloudflare", "clickhouse"]);

const connectionConfigSchema = z.union([
	ResendConfigSchema,
	CloudflareConfigSchema,
	ClickhouseConfigSchema,
]);

const partialConnectionFieldsSchema = connectionCommonUpsertSchema.partial();

type PartialConnectionUpdate = z.infer<typeof partialConnectionFieldsSchema> & {
	type?: z.infer<typeof connectionTypeSchema>;
	config?: z.infer<typeof connectionConfigSchema>;
};

export const connectionUpdateSchema = partialConnectionFieldsSchema
	.extend({
		type: connectionTypeSchema.optional(),
		config: connectionConfigSchema.optional(),
	})
	.superRefine((value: PartialConnectionUpdate, ctx: z.RefinementCtx) => {
		if (Object.keys(value).length === 0) {
			ctx.addIssue({
				code: "custom",
				message: "At least one field is required",
			});
		}

		const hasType = value.type !== undefined;
		const hasConfig = value.config !== undefined;

		if (hasType !== hasConfig) {
			ctx.addIssue({
				code: "custom",
				message: "type and config must be provided together",
				path: hasType ? ["config"] : ["type"],
			});
			return;
		}

		if (hasType && hasConfig) {
			const result = connectionTypeConfigPairSchema.safeParse({
				type: value.type,
				config: value.config,
			});
			if (!result.success) {
				for (const issue of result.error.issues) {
					ctx.addIssue({
						code: "custom",
						message: issue.message,
						path: issue.path,
					});
				}
			}
		}
	});

export const connectionSuccessSchema = z
	.object({
		message: z.string().openapi({
			description: "Response message",
			example: "Connection successfully created",
		}),
		data: connectionSchema,
		metadata: z.object({}).nullable(),
	})
	.openapi("ConnectionSuccess");

export const connectionListSuccessSchema = connectionSuccessSchema
	.extend({
		data: z.array(connectionSchema),
		metadata: searchOptionsSchema.nullable(),
	})
	.openapi("ConnectionListSuccess");

export type ConnectionEntityType = z.infer<typeof connectionSchema>;
export type ConnectionListSuccessType = z.infer<
	typeof connectionListSuccessSchema
>;
export type ConnectionUpsertInput = z.infer<typeof connectionUpsertSchema>;
export type ConnectionUpdateInput = z.infer<typeof connectionUpdateSchema>;
