import z from "zod";

const highlightedAttributeExpressionSchema = z.object({
	sqlExpression: z.string().min(1),
	luceneExpression: z.string().optional(),
	alias: z.string().optional(),
});

const materializedViewAggregatedColumnSchema = z.object({
	sourceColumn: z.string().nullable().optional(),
	aggFn: z.enum([
		"avg",
		"count",
		"count_distinct",
		"last_value",
		"max",
		"min",
		"quantile",
		"sum",
		"any",
		"none",
		"histogram",
	]),
	mvColumn: z.string().min(1),
});

const materializedViewSchema = z.object({
	databaseName: z.string().min(1),
	tableName: z.string().min(1),
	dimensionColumns: z.string().default(""),
	minGranularity: z.string().regex(/^\d+ (second|minute|hour|day)$/),
	minDate: z.iso.datetime().nullable().optional(),
	timestampColumn: z.string().min(1),
	aggregatedColumns: z.array(materializedViewAggregatedColumnSchema).min(1),
});

export const BaseSourceConfigSchema = z.object({
	database: z.string().nullable().default(null),
	table: z.string().nullable().default(null),
	defaultOrderByQuery: z.string().nullable().default("Timestamp DESC"),
	resourceAttributesField: z.string().nullable().default("ResourceAttributes"),
	timestampQueryExpression: z.string().nullable().default("Timestamp"),
	displayedTimestampExpression: z.string().nullable().default("Timestamp"),
	serviceNameField: z.string().nullable().default("ServiceName"),
	traceIdField: z.string().nullable().default("TraceId"),
	spanIdField: z.string().nullable().default("SpanId"),
	luceneImplicitColumnField: z.string().nullable().default("Body"),
	querySettings: z
		.array(
			z.object({
				setting: z.string().min(1),
				value: z.string().min(1),
			}),
		)
		.max(10)
		.nullable()
		.default([]),
	metricSourceId: z.uuidv7().nullable().default(null),
	materializedViews: z.array(materializedViewSchema).nullable().default([]),
	highlightedRowAttributeExpressions: z
		.array(highlightedAttributeExpressionSchema)
		.nullable()
		.default([]),
	highlightedTraceAttributeExpressions: z
		.array(highlightedAttributeExpressionSchema)
		.nullable()
		.default([]),
});
