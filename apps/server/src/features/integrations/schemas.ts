import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { models } from "@/db/models";
import {
	supportedIntegrationSchemas,
	supportedIntegrationTypes,
} from "@/integrations/senderFactory";
import { searchOptionsSchema } from "../../common/schemas/baseSchemas";

export const baseIntegrationsSchema = createSelectSchema(
	models.integrations,
).extend({
	name: z.string().min(1).max(255),
	isActive: z.boolean().default(true),
	isDefault: z.boolean().default(false),
});

export type IntegrationsType = z.infer<typeof baseIntegrationsSchema>;

export const integrationsSchema = baseIntegrationsSchema.extend({
	type: z.enum(supportedIntegrationTypes),
	config: supportedIntegrationSchemas,
});

export const integrationsUpsertSchema = integrationsSchema
	.omit({
		id: true,
		organizationId: true,
		createdAt: true,
		updatedAt: true,
	})
	.openapi("IntegrationsUpsert");

export const integrationUpdateSchema = integrationsUpsertSchema
	.partial()
	.refine((value) => Object.keys(value).length > 0, {
		message: "At least one field is required",
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
