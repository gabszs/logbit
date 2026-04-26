import { z } from "zod";

export const logsConfigSchema = z.object({
	database: z.string().nullable().default(null),
	table: z.string().nullable().default(null),
	defaultSelectQuery: z
		.string()
		.nullable()
		.default("Timestamp, ServiceName as service, SeverityText as level, Body"),
	defaultOrderByQuery: z.string().nullable().default("Timestamp DESC"),
	severityField: z.string().nullable().default("SeverityText"),
	resourceAttributesField: z.string().nullable().default("ResourceAttributes"),
	logAttributesField: z.string().nullable().default("LogAttributes"),
	timestampField: z.string().nullable().default("Timestamp"),
	serviceNameField: z.string().nullable().default("ServiceName"),
	bodyField: z.string().nullable().default("Body"),
	traceIdField: z.string().nullable().default("TraceId"),
	spanIdField: z.string().nullable().default("SpanId"),
	luceneImplicitColumnField: z.string().nullable().default("Body"),
	traceSourceId: z.uuidv7().nullable().default(null),
	metricSourceId: z.uuidv7().nullable().default(null),
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
		timestampField: logsConfigSchema.shape.timestampField.unwrap().optional(),
		serviceNameField: logsConfigSchema.shape.serviceNameField
			.unwrap()
			.optional(),
		bodyField: logsConfigSchema.shape.bodyField.unwrap().optional(),
		traceIdField: logsConfigSchema.shape.traceIdField.unwrap().optional(),
		spanIdField: logsConfigSchema.shape.spanIdField.unwrap().optional(),
		luceneImplicitColumnField: logsConfigSchema.shape.luceneImplicitColumnField
			.unwrap()
			.optional(),
		traceSourceId: logsConfigSchema.shape.traceSourceId.unwrap().optional(),
		metricSourceId: logsConfigSchema.shape.metricSourceId.unwrap().optional(),
	})
	.openapi("PatchLogsConfig");
