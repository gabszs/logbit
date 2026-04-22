import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { models } from "@/db/models";
import { CloudflareEmailConfigSchema } from "@/integrations/cloudflare/email/schemas";
import { ResendConfigSchema } from "@/integrations/resend/api/schemas";
import { WebhookConfigSchema } from "@/integrations/webhook/http/schemas";
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

const webhookConnectionSchema = connectionCommonSchema.extend({
	type: z.literal("webhook"),
	config: WebhookConfigSchema,
});

const cloudflareEmailConnectionSchema = connectionCommonSchema.extend({
	type: z.literal("cloudflare_email"),
	config: CloudflareEmailConfigSchema,
});

const resendConnectionSchema = connectionCommonSchema.extend({
	type: z.literal("resend"),
	config: ResendConfigSchema,
});

const connectionTypeConfigPairSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("webhook"),
		config: WebhookConfigSchema,
	}),
	z.object({
		type: z.literal("cloudflare_email"),
		config: CloudflareEmailConfigSchema,
	}),
	z.object({
		type: z.literal("resend"),
		config: ResendConfigSchema,
	}),
]);

export const connectionSchema = z.discriminatedUnion("type", [
	webhookConnectionSchema,
	cloudflareEmailConnectionSchema,
	resendConnectionSchema,
]);

const connectionCommonUpsertSchema = connectionCommonSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
});

const webhookConnectionUpsertSchema = connectionCommonUpsertSchema.extend({
	type: z.literal("webhook"),
	config: WebhookConfigSchema,
});

const cloudflareEmailConnectionUpsertSchema =
	connectionCommonUpsertSchema.extend({
		type: z.literal("cloudflare_email"),
		config: CloudflareEmailConfigSchema,
	});

const resendConnectionUpsertSchema = connectionCommonUpsertSchema.extend({
	type: z.literal("resend"),
	config: ResendConfigSchema,
});

export const connectionUpsertSchema = z
	.discriminatedUnion("type", [
		webhookConnectionUpsertSchema,
		cloudflareEmailConnectionUpsertSchema,
		resendConnectionUpsertSchema,
	])
	.openapi("ConnectionUpsert");

const connectionTypeSchema = z.enum(["webhook", "cloudflare_email", "resend"]);

const connectionConfigSchema = z.union([
	WebhookConfigSchema,
	CloudflareEmailConfigSchema,
	ResendConfigSchema,
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

export const sendConnectionEmailSchema = z.object({
	connectionId: z.uuid(),
	organizationId: z.uuid(),
	// email: sendEmailInputSchema,
});

export const connectionTestEmailSchema = z.object({
	connectionId: z.uuid(),
	organizationId: z.uuid(),
	to: z.email(),
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

export type ConnectionListSuccessType = z.infer<
	typeof connectionListSuccessSchema
>;
export type ConnectionUpsertInput = z.infer<typeof connectionUpsertSchema>;
export type ConnectionUpdateInput = z.infer<typeof connectionUpdateSchema>;
export type SendConnectionEmailInput = z.infer<
	typeof sendConnectionEmailSchema
>;
export type ConnectionTestEmailInput = z.infer<
	typeof connectionTestEmailSchema
>;
