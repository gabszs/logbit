import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { searchOptionsSchema } from "@/common/schemas/baseSchemas";
import { models } from "@/db/models";
import {
	logsConfigSchema,
	patchLogsConfigSchema,
	upsertLogsConfigSchema,
} from "@/features/sources/logs/schemas";

export const baseSourcesSchema = createSelectSchema(models.sources).extend({
	id: z.uuidv7(),
	name: z.string().min(1).max(255),
	organizationId: z.uuidv7(),
	connectionId: z.uuidv7(),
});

export type SourcesType = z.infer<typeof baseSourcesSchema>;

const sourceCommonSchema = baseSourcesSchema.omit({
	type: true,
	config: true,
});

const logSourceSchema = sourceCommonSchema.extend({
	type: z.literal("log"),
	config: logsConfigSchema,
});

export const sourcesSchema = z.discriminatedUnion("type", [logSourceSchema]);

const sourceCommonUpsertSchema = sourceCommonSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
});

const logSourceUpsertSchema = sourceCommonUpsertSchema.extend({
	type: z.literal("log"),
	config: upsertLogsConfigSchema,
});

export const sourcesUpsertSchema = z
	.discriminatedUnion("type", [logSourceUpsertSchema])
	.openapi("SourcesUpsert");

const partialSourceFieldsSchema = sourceCommonUpsertSchema.partial();

type PartialSourceUpdate = z.infer<typeof partialSourceFieldsSchema> & {
	config?: z.infer<typeof patchLogsConfigSchema>;
};

export const sourceUpdateSchema = partialSourceFieldsSchema
	.extend({
		config: patchLogsConfigSchema.optional(),
	})
	.strict()
	.superRefine((value: PartialSourceUpdate, ctx: z.RefinementCtx) => {
		if (Object.keys(value).length === 0) {
			ctx.addIssue({
				code: "custom",
				message: "At least one field is required",
			});
		}
	});

export const sourcesSuccessSchema = z
	.object({
		message: z.string().openapi({
			description: "Response message",
			example: "Source successfully created",
		}),
		data: sourcesSchema,
		metadata: z.object({}).nullable(),
	})
	.openapi("SourcesSuccess");

export const sourcesListSuccessSchema = sourcesSuccessSchema
	.extend({
		data: z.array(sourcesSchema),
		metadata: searchOptionsSchema.nullable(),
	})
	.openapi("SourcesListSuccess");

export type SourcesListSuccessType = z.infer<typeof sourcesListSuccessSchema>;
export type SourcesUpsertInput = z.infer<typeof sourcesUpsertSchema>;
export type SourceUpdateInput = z.infer<typeof sourceUpdateSchema>;
