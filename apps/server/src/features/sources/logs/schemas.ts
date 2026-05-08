import { BaseSourceConfigSchema } from "@/features/sources/base/schemas";
import { z } from "zod";

export const logsConfigSchema = BaseSourceConfigSchema.extend({
	defaultSelectQuery: z
		.string()
		.nullable()
		.default("Timestamp, ServiceName as service, SeverityText as level, Body"),
	severityField: z.string().nullable().default("SeverityText"),
	logAttributesField: z.string().nullable().default("LogAttributes"),
	bodyField: z.string().nullable().default("Body"),
	traceSourceId: z.uuidv7().nullable().default(null),
	// profilesSourceId: z.uuidv7().nullable(),
});
export type LogsConfigType = z.infer<typeof logsConfigSchema>;

export const upsertLogsConfigSchema =
	logsConfigSchema.openapi("UpsertLogsConfig");

export const patchLogsConfigSchema = z
	.object({
		database: logsConfigSchema.shape.database.unwrap().optional(),
		table: logsConfigSchema.shape.table.unwrap().optional(),
		defaultSelectQuery: logsConfigSchema.shape.defaultSelectQuery
			.unwrap()
			.optional(),
		defaultOrderByQuery: logsConfigSchema.shape.defaultOrderByQuery
			.unwrap()
			.optional(),
		severityField: logsConfigSchema.shape.severityField.unwrap().optional(),
		resourceAttributesField: logsConfigSchema.shape.resourceAttributesField
			.unwrap()
			.optional(),
		logAttributesField: logsConfigSchema.shape.logAttributesField
			.unwrap()
			.optional(),
		timestampQueryField: logsConfigSchema.shape.timestampQueryField
			.unwrap()
			.optional(),
		displayedTimestampField: logsConfigSchema.shape.displayedTimestampField
			.unwrap()
			.optional(),
		serviceNameField: logsConfigSchema.shape.serviceNameField
			.unwrap()
			.optional(),
		bodyField: logsConfigSchema.shape.bodyField.unwrap().optional(),
		traceIdField: logsConfigSchema.shape.traceIdField.unwrap().optional(),
		spanIdField: logsConfigSchema.shape.spanIdField.unwrap().optional(),
		luceneImplicitColumnField: logsConfigSchema.shape.luceneImplicitColumnField
			.unwrap()
			.optional(),
		querySettings: logsConfigSchema.shape.querySettings.unwrap().optional(),
		traceSourceId: logsConfigSchema.shape.traceSourceId.unwrap().optional(),
		metricSourceId: logsConfigSchema.shape.metricSourceId.unwrap().optional(),
		materializedViews: logsConfigSchema.shape.materializedViews
			.unwrap()
			.optional(),
		highlightedRowAttributeExpressions:
			logsConfigSchema.shape.highlightedRowAttributeExpressions
				.unwrap()
				.optional(),
		highlightedTraceAttributeExpressions:
			logsConfigSchema.shape.highlightedTraceAttributeExpressions
				.unwrap()
				.optional(),
	})
	.strict()
	.openapi("PatchLogsConfig");
