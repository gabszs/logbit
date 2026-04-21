import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { searchOptionsSchema } from "@/common/schemas/baseSchemas";
import { models } from "@/db/models";
import { chLogsConfigSchema } from "@/integrations/chSources/logs/schemas";

export const baseSourcesSchema = createSelectSchema(models.sources).extend({
	id: z.uuidv7(),
	name: z.string().min(1).max(255),
	organizationId: z.uuidv7(),
	integrationId: z.uuidv7(),
});

export type SourcesType = z.infer<typeof baseSourcesSchema>;

const sourceCommonSchema = baseSourcesSchema.omit({
	type: true,
	config: true,
});

const logSourceSchema = sourceCommonSchema.extend({
	type: z.literal("log"),
	config: chLogsConfigSchema,
});

const sourceTypeConfigPairSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("log"),
		config: chLogsConfigSchema,
	}),
]);

export const sourcesSchema = z.discriminatedUnion("type", [logSourceSchema]);

const sourceCommonUpsertSchema = sourceCommonSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
});

const logSourceUpsertSchema = sourceCommonUpsertSchema.extend({
	type: z.literal("log"),
	config: chLogsConfigSchema,
});

export const sourcesUpsertSchema = z
	.discriminatedUnion("type", [logSourceUpsertSchema])
	.openapi("SourcesUpsert");

const sourceTypeSchema = z.enum(["log"]);

const partialSourceFieldsSchema = sourceCommonUpsertSchema.partial();

type PartialSourceUpdate = z.infer<typeof partialSourceFieldsSchema> & {
	type?: z.infer<typeof sourceTypeSchema>;
	config?: z.infer<typeof chLogsConfigSchema>;
};

export const sourceUpdateSchema = partialSourceFieldsSchema
	.extend({
		type: sourceTypeSchema.optional(),
		config: chLogsConfigSchema.optional(),
	})
	.superRefine((value: PartialSourceUpdate, ctx: z.RefinementCtx) => {
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
			const result = sourceTypeConfigPairSchema.safeParse({
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

export type SourcesUpsertInput = z.infer<typeof sourcesUpsertSchema>;
export type SourceUpdateInput = z.infer<typeof sourceUpdateSchema>;
