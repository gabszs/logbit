import { z } from "zod";
import { integrationsSchema } from "@/db/models";
import { searchOptionsSchema } from "../../common/schemas/baseSchemas";

export const integrationsUpsertSchema = integrationsSchema
	.omit({
		id: true,
		organizationId: true,
		createdAt: true,
		updatedAt: true,
	})
	.openapi("IntegrationsUpsert");

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
