import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { models } from "@/db/models";
import { CloudflareEmailConfigSchema } from "@/integrations/cloudflare/email/schemas";
import { ResendConfigSchema } from "@/integrations/resend/api/schemas";
import { WebhookConfigSchema } from "@/integrations/webhook/http/schemas";
import { searchOptionsSchema } from "../../common/schemas/baseSchemas";

export const baseIntegrationsSchema = createSelectSchema(
	models.integrations,
).extend({
	name: z.string().min(1).max(255),
	isActive: z.boolean(),
	isDefault: z.boolean(),
});

export type IntegrationsType = z.infer<typeof baseIntegrationsSchema>;

const integrationCommonSchema = baseIntegrationsSchema.omit({
	type: true,
	config: true,
});

const webhookIntegrationSchema = integrationCommonSchema.extend({
	type: z.literal("webhook"),
	config: WebhookConfigSchema,
});

const cloudflareEmailIntegrationSchema = integrationCommonSchema.extend({
	type: z.literal("cloudflare_email"),
	config: CloudflareEmailConfigSchema,
});

const resendIntegrationSchema = integrationCommonSchema.extend({
	type: z.literal("resend"),
	config: ResendConfigSchema,
});

const integrationTypeConfigPairSchema = z.discriminatedUnion("type", [
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

export const integrationsSchema = z.discriminatedUnion("type", [
	webhookIntegrationSchema,
	cloudflareEmailIntegrationSchema,
	resendIntegrationSchema,
]);

const integrationCommonUpsertSchema = integrationCommonSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
});

const webhookIntegrationUpsertSchema = integrationCommonUpsertSchema.extend({
	type: z.literal("webhook"),
	config: WebhookConfigSchema,
});

const cloudflareEmailIntegrationUpsertSchema =
	integrationCommonUpsertSchema.extend({
		type: z.literal("cloudflare_email"),
		config: CloudflareEmailConfigSchema,
	});

const resendIntegrationUpsertSchema = integrationCommonUpsertSchema.extend({
	type: z.literal("resend"),
	config: ResendConfigSchema,
});

export const integrationsUpsertSchema = z
	.discriminatedUnion("type", [
		webhookIntegrationUpsertSchema,
		cloudflareEmailIntegrationUpsertSchema,
		resendIntegrationUpsertSchema,
	])
	.openapi("IntegrationsUpsert");

const integrationTypeSchema = z.enum(["webhook", "cloudflare_email", "resend"]);

const integrationConfigSchema = z.union([
	WebhookConfigSchema,
	CloudflareEmailConfigSchema,
	ResendConfigSchema,
]);

const partialIntegrationFieldsSchema = integrationCommonUpsertSchema.partial();

type PartialIntegrationUpdate = z.infer<
	typeof partialIntegrationFieldsSchema
> & {
	type?: z.infer<typeof integrationTypeSchema>;
	config?: z.infer<typeof integrationConfigSchema>;
};

export const integrationUpdateSchema = partialIntegrationFieldsSchema
	.extend({
		type: integrationTypeSchema.optional(),
		config: integrationConfigSchema.optional(),
	})
	.superRefine((value: PartialIntegrationUpdate, ctx: z.RefinementCtx) => {
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
			const result = integrationTypeConfigPairSchema.safeParse({
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

export const sendIntegrationEmailSchema = z.object({
	integrationId: z.uuid(),
	organizationId: z.uuid(),
	// email: sendEmailInputSchema,
});

export const integrationTestEmailSchema = z.object({
	integrationId: z.uuid(),
	organizationId: z.uuid(),
	to: z.email(),
});

export const integrationsSuccessSchema = z
	.object({
		message: z.string().openapi({
			description: "Response message",
			example: "Integration successfully created",
		}),
		data: integrationsSchema,
		metadata: z.object({}).nullable(),
	})
	.openapi("IntegrationsSuccess");

export const integrationsListSuccessSchema = integrationsSuccessSchema
	.extend({
		data: z.array(integrationsSchema),
		metadata: searchOptionsSchema.nullable(),
	})
	.openapi("IntegrationsListSuccess");

export type IntegrationsUpsertInput = z.infer<typeof integrationsUpsertSchema>;
export type IntegrationUpdateInput = z.infer<typeof integrationUpdateSchema>;
export type SendIntegrationEmailInput = z.infer<
	typeof sendIntegrationEmailSchema
>;
export type IntegrationTestEmailInput = z.infer<
	typeof integrationTestEmailSchema
>;
