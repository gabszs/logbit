import { z } from "zod";

const requiredString = (message: string) => z.string().min(1, { message });

const logsConfigFields = {
	defaultSelectQuery: requiredString("Default select query is required"),
	defaultOrderByQuery: requiredString("Default order by query is required"),
	severityField: requiredString("Severity field is required"),
	resourceAttributesField: requiredString("Resource attributes field is required"),
	logAttributesField: requiredString("Log attributes field is required"),
	timestampField: requiredString("Timestamp field is required"),
	serviceNameField: requiredString("Service name field is required"),
	bodyField: requiredString("Body field is required"),
	traceIdField: requiredString("Trace ID field is required"),
	spanIdField: requiredString("Span ID field is required"),
	luceneImplicitColumnField: requiredString(
		"Lucene implicit column field is required",
	),
	traceSourceId: z.uuidv7().nullable(),
	metricSourceId: z.uuidv7().nullable(),
};

export const logsConfigSchema = z.object({
	defaultSelectQuery: logsConfigFields.defaultSelectQuery.default(
		"Timestamp, ServiceName as service, SeverityText as level, Body",
	),
	defaultOrderByQuery:
		logsConfigFields.defaultOrderByQuery.default("Timestamp DESC"),
	severityField: logsConfigFields.severityField.default("SeverityText"),
	resourceAttributesField:
		logsConfigFields.resourceAttributesField.default("ResourceAttributes"),
	logAttributesField:
		logsConfigFields.logAttributesField.default("LogAttributes"),
	timestampField: logsConfigFields.timestampField.default("Timestamp"),
	serviceNameField: logsConfigFields.serviceNameField.default("ServiceName"),
	bodyField: logsConfigFields.bodyField.default("Body"),
	traceIdField: logsConfigFields.traceIdField.default("TraceId"),
	spanIdField: logsConfigFields.spanIdField.default("SpanId"),
	luceneImplicitColumnField:
		logsConfigFields.luceneImplicitColumnField.default("Body"),
	traceSourceId: logsConfigFields.traceSourceId.default(null),
	metricSourceId: logsConfigFields.metricSourceId.default(null),
	// profilesSourceId: z.uuidv7().nullable(),
});
export type LogsConfigType = z.infer<typeof logsConfigSchema>;

export const upsertLogsConfigSchema =
	logsConfigSchema.openapi("UpsertLogsConfig");

export const patchLogsConfigSchema = z
	.object(logsConfigFields)
	.partial()
	.openapi("PatchLogsConfig");
