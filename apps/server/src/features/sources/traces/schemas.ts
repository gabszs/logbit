import { z } from "zod";
import { BaseSourceConfigSchema } from "@/features/sources/base/schemas";

export const tracesConfigSchema = BaseSourceConfigSchema.extend({
	defaultSelectQuery: z
		.string()
		.nullable()
		.default(
			"Timestamp, ServiceName as service, StatusCode as level, round(Duration / 1e6) as duration, SpanName",
		),
	sampleRateField: z.string().nullable().default(null),

	spanAttributesField: z.string().nullable().default("SpanAttributes"),
	durationField: z.string().nullable().default("Duration"),
	durationPrecisionField: z.number().min(0).max(9).nullable().default(9),
	parentSpanIdField: z.string().nullable().default("ParentSpanId"),
	spanEventsField: z.string().nullable().default("Events"),
	spanIdField: z.string().nullable().default("SpanId"),
	spanKindField: z.string().nullable().default("SpanKind"),
	spanNameField: z.string().nullable().default("SpanName"),
	statusCodeField: z.string().nullable().default("StatusCode"),
	statusMessageField: z.string().nullable().default("StatusMessage"),
	bodyField: z.string().nullable().default("SpanName"),
	luceneImplicitColumnField: z.string().nullable().default("SpanName"),

	logSourceId: z.uuidv7().nullable().default(null),
	// profilesSourceId: z.uuidv7().nullable(),
});
export type TracesConfigType = z.infer<typeof tracesConfigSchema>;

export const upsertTracesConfigSchema =
	tracesConfigSchema.openapi("UpsertTracesConfig");

export const patchTracesConfigSchema = z
	.object({
		database: tracesConfigSchema.shape.database.unwrap().optional(),
		table: tracesConfigSchema.shape.table.unwrap().optional(),
		defaultSelectQuery: tracesConfigSchema.shape.defaultSelectQuery
			.unwrap()
			.optional(),
		defaultOrderByQuery: tracesConfigSchema.shape.defaultOrderByQuery
			.unwrap()
			.optional(),
		resourceAttributesField: tracesConfigSchema.shape.resourceAttributesField
			.unwrap()
			.optional(),
		timestampQueryField: tracesConfigSchema.shape.timestampQueryField
			.unwrap()
			.optional(),
		displayedTimestampField: tracesConfigSchema.shape.displayedTimestampField
			.unwrap()
			.optional(),
		serviceNameField: tracesConfigSchema.shape.serviceNameField
			.unwrap()
			.optional(),
		traceIdField: tracesConfigSchema.shape.traceIdField.unwrap().optional(),
		spanIdField: tracesConfigSchema.shape.spanIdField.unwrap().optional(),
		luceneImplicitColumnField:
			tracesConfigSchema.shape.luceneImplicitColumnField.unwrap().optional(),
		queryRangeLimit: tracesConfigSchema.shape.queryRangeLimit
			.unwrap()
			.optional(),
		querySettings: tracesConfigSchema.shape.querySettings.unwrap().optional(),
		metricSourceId: tracesConfigSchema.shape.metricSourceId.unwrap().optional(),
		materializedViews: tracesConfigSchema.shape.materializedViews
			.unwrap()
			.optional(),
		highlightedRowAttributeExpressions:
			tracesConfigSchema.shape.highlightedRowAttributeExpressions
				.unwrap()
				.optional(),
		highlightedTraceAttributeExpressions:
			tracesConfigSchema.shape.highlightedTraceAttributeExpressions
				.unwrap()
				.optional(),
		sampleRateField: tracesConfigSchema.shape.sampleRateField
			.unwrap()
			.optional(),
		spanAttributesField: tracesConfigSchema.shape.spanAttributesField
			.unwrap()
			.optional(),
		durationField: tracesConfigSchema.shape.durationField.unwrap().optional(),
		durationPrecisionField: tracesConfigSchema.shape.durationPrecisionField
			.unwrap()
			.optional(),
		parentSpanIdField: tracesConfigSchema.shape.parentSpanIdField
			.unwrap()
			.optional(),
		spanEventsField: tracesConfigSchema.shape.spanEventsField
			.unwrap()
			.optional(),
		spanKindField: tracesConfigSchema.shape.spanKindField.unwrap().optional(),
		spanNameField: tracesConfigSchema.shape.spanNameField.unwrap().optional(),
		statusCodeField: tracesConfigSchema.shape.statusCodeField
			.unwrap()
			.optional(),
		statusMessageField: tracesConfigSchema.shape.statusMessageField
			.unwrap()
			.optional(),
		bodyField: tracesConfigSchema.shape.bodyField.unwrap().optional(),
		logSourceId: tracesConfigSchema.shape.logSourceId.unwrap().optional(),
	})
	.strict()
	.openapi("PatchTracesConfig");
