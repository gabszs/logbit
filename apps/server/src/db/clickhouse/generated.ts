import type { ColumnType } from "kysely";
import { z } from "zod";

export type Generated<T> =
	T extends ColumnType<infer S, infer I, infer U>
		? ColumnType<S, I | undefined, U>
		: ColumnType<T, T | undefined, T>;

export type Json = ColumnType<JsonValue, string, string>;

export type JsonArray = JsonValue[];

export type JsonObject = {
	[K in string]?: JsonValue;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type DateTime64 = ColumnType<string, string | Date, string | Date>;

export type StringArray = string[];

export type NumberArray = number[];

export type DateTime64Array = DateTime64[];

export type StringMap = Record<string, string>;

export type StringMapArray = StringMap[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema),
	]),
);

export const DateTime64Schema = z.coerce.date();
export const DateTime64ArraySchema = z.array(DateTime64Schema);

export const OtelLogs = z.object({
	Timestamp: DateTime64Schema,
	TraceId: z.string(),
	SpanId: z.string(),
	TraceFlags: z.coerce.number(),
	SeverityText: z.string(),
	SeverityNumber: z.coerce.number(),
	ServiceName: z.string(),
	Body: z.string(),
	ResourceSchemaUrl: z.string(),
	ResourceAttributes: JsonValueSchema,
	ResourceAttributesKeys: z.array(z.string()),
	ScopeSchemaUrl: z.string(),
	ScopeName: z.string(),
	ScopeVersion: z.string(),
	ScopeAttributes: JsonValueSchema,
	ScopeAttributesKeys: z.array(z.string()),
	LogAttributes: JsonValueSchema,
	LogAttributesKeys: z.array(z.string()),
	EventName: z.string(),
});
export interface OtelLogs {
	Body: Generated<string>;
	EventName: Generated<string>;
	LogAttributes: Generated<Json>;
	LogAttributesKeys: Generated<StringArray>;
	ResourceAttributes: Generated<Json>;
	ResourceAttributesKeys: Generated<StringArray>;
	ResourceSchemaUrl: Generated<string>;
	ScopeAttributes: Generated<Json>;
	ScopeAttributesKeys: Generated<StringArray>;
	ScopeName: Generated<string>;
	ScopeSchemaUrl: Generated<string>;
	ScopeVersion: Generated<string>;
	ServiceName: Generated<string>;
	SeverityNumber: Generated<number>;
	SeverityText: Generated<string>;
	SpanId: Generated<string>;
	Timestamp: Generated<DateTime64>;
	TraceFlags: Generated<number>;
	TraceId: Generated<string>;
}

export const OtelMetricsExponentialHistogram = z.object({
	ResourceAttributes: z.record(z.string(), z.string()),
	ResourceSchemaUrl: z.string(),
	ScopeName: z.string(),
	ScopeVersion: z.string(),
	ScopeAttributes: z.record(z.string(), z.string()),
	ScopeDroppedAttrCount: z.coerce.number(),
	ScopeSchemaUrl: z.string(),
	ServiceName: z.string(),
	MetricName: z.string(),
	MetricDescription: z.string(),
	MetricUnit: z.string(),
	Attributes: z.record(z.string(), z.string()),
	StartTimeUnix: DateTime64Schema,
	TimeUnix: DateTime64Schema,
	Count: z.coerce.number(),
	Sum: z.coerce.number(),
	Scale: z.coerce.number(),
	ZeroCount: z.coerce.number(),
	PositiveOffset: z.coerce.number(),
	PositiveBucketCounts: z.array(z.coerce.number()),
	NegativeOffset: z.coerce.number(),
	NegativeBucketCounts: z.array(z.coerce.number()),
	"Exemplars.FilteredAttributes": z.array(z.record(z.string(), z.string())),
	"Exemplars.TimeUnix": DateTime64ArraySchema,
	"Exemplars.Value": z.array(z.coerce.number()),
	"Exemplars.SpanId": z.array(z.string()),
	"Exemplars.TraceId": z.array(z.string()),
	Flags: z.coerce.number(),
	Min: z.coerce.number(),
	Max: z.coerce.number(),
	AggregationTemporality: z.coerce.number(),
});
export interface OtelMetricsExponentialHistogram {
	AggregationTemporality: Generated<number>;
	Attributes: Generated<StringMap>;
	Count: Generated<number>;
	"Exemplars.FilteredAttributes": Generated<StringMapArray>;
	"Exemplars.SpanId": Generated<StringArray>;
	"Exemplars.TimeUnix": Generated<DateTime64Array>;
	"Exemplars.TraceId": Generated<StringArray>;
	"Exemplars.Value": Generated<NumberArray>;
	Flags: Generated<number>;
	Max: Generated<number>;
	MetricDescription: Generated<string>;
	MetricName: Generated<string>;
	MetricUnit: Generated<string>;
	Min: Generated<number>;
	NegativeBucketCounts: Generated<NumberArray>;
	NegativeOffset: Generated<number>;
	PositiveBucketCounts: Generated<NumberArray>;
	PositiveOffset: Generated<number>;
	ResourceAttributes: Generated<StringMap>;
	ResourceSchemaUrl: Generated<string>;
	Scale: Generated<number>;
	ScopeAttributes: Generated<StringMap>;
	ScopeDroppedAttrCount: Generated<number>;
	ScopeName: Generated<string>;
	ScopeSchemaUrl: Generated<string>;
	ScopeVersion: Generated<string>;
	ServiceName: Generated<string>;
	StartTimeUnix: Generated<DateTime64>;
	Sum: Generated<number>;
	TimeUnix: Generated<DateTime64>;
	ZeroCount: Generated<number>;
}

export const OtelMetricsGauge = z.object({
	ResourceAttributes: z.record(z.string(), z.string()),
	ResourceSchemaUrl: z.string(),
	ScopeName: z.string(),
	ScopeVersion: z.string(),
	ScopeAttributes: z.record(z.string(), z.string()),
	ScopeDroppedAttrCount: z.coerce.number(),
	ScopeSchemaUrl: z.string(),
	ServiceName: z.string(),
	MetricName: z.string(),
	MetricDescription: z.string(),
	MetricUnit: z.string(),
	Attributes: z.record(z.string(), z.string()),
	StartTimeUnix: DateTime64Schema,
	TimeUnix: DateTime64Schema,
	Value: z.coerce.number(),
	Flags: z.coerce.number(),
	"Exemplars.FilteredAttributes": z.array(z.record(z.string(), z.string())),
	"Exemplars.TimeUnix": DateTime64ArraySchema,
	"Exemplars.Value": z.array(z.coerce.number()),
	"Exemplars.SpanId": z.array(z.string()),
	"Exemplars.TraceId": z.array(z.string()),
});
export interface OtelMetricsGauge {
	Attributes: Generated<StringMap>;
	"Exemplars.FilteredAttributes": Generated<StringMapArray>;
	"Exemplars.SpanId": Generated<StringArray>;
	"Exemplars.TimeUnix": Generated<DateTime64Array>;
	"Exemplars.TraceId": Generated<StringArray>;
	"Exemplars.Value": Generated<NumberArray>;
	Flags: Generated<number>;
	MetricDescription: Generated<string>;
	MetricName: Generated<string>;
	MetricUnit: Generated<string>;
	ResourceAttributes: Generated<StringMap>;
	ResourceSchemaUrl: Generated<string>;
	ScopeAttributes: Generated<StringMap>;
	ScopeDroppedAttrCount: Generated<number>;
	ScopeName: Generated<string>;
	ScopeSchemaUrl: Generated<string>;
	ScopeVersion: Generated<string>;
	ServiceName: Generated<string>;
	StartTimeUnix: Generated<DateTime64>;
	TimeUnix: Generated<DateTime64>;
	Value: Generated<number>;
}

export const OtelMetricsHistogram = z.object({
	ResourceAttributes: z.record(z.string(), z.string()),
	ResourceSchemaUrl: z.string(),
	ScopeName: z.string(),
	ScopeVersion: z.string(),
	ScopeAttributes: z.record(z.string(), z.string()),
	ScopeDroppedAttrCount: z.coerce.number(),
	ScopeSchemaUrl: z.string(),
	ServiceName: z.string(),
	MetricName: z.string(),
	MetricDescription: z.string(),
	MetricUnit: z.string(),
	Attributes: z.record(z.string(), z.string()),
	StartTimeUnix: DateTime64Schema,
	TimeUnix: DateTime64Schema,
	Count: z.coerce.number(),
	Sum: z.coerce.number(),
	BucketCounts: z.array(z.coerce.number()),
	ExplicitBounds: z.array(z.coerce.number()),
	"Exemplars.FilteredAttributes": z.array(z.record(z.string(), z.string())),
	"Exemplars.TimeUnix": DateTime64ArraySchema,
	"Exemplars.Value": z.array(z.coerce.number()),
	"Exemplars.SpanId": z.array(z.string()),
	"Exemplars.TraceId": z.array(z.string()),
	Flags: z.coerce.number(),
	Min: z.coerce.number(),
	Max: z.coerce.number(),
	AggregationTemporality: z.coerce.number(),
});
export interface OtelMetricsHistogram {
	AggregationTemporality: Generated<number>;
	Attributes: Generated<StringMap>;
	BucketCounts: Generated<NumberArray>;
	Count: Generated<number>;
	"Exemplars.FilteredAttributes": Generated<StringMapArray>;
	"Exemplars.SpanId": Generated<StringArray>;
	"Exemplars.TimeUnix": Generated<DateTime64Array>;
	"Exemplars.TraceId": Generated<StringArray>;
	"Exemplars.Value": Generated<NumberArray>;
	ExplicitBounds: Generated<NumberArray>;
	Flags: Generated<number>;
	Max: Generated<number>;
	MetricDescription: Generated<string>;
	MetricName: Generated<string>;
	MetricUnit: Generated<string>;
	Min: Generated<number>;
	ResourceAttributes: Generated<StringMap>;
	ResourceSchemaUrl: Generated<string>;
	ScopeAttributes: Generated<StringMap>;
	ScopeDroppedAttrCount: Generated<number>;
	ScopeName: Generated<string>;
	ScopeSchemaUrl: Generated<string>;
	ScopeVersion: Generated<string>;
	ServiceName: Generated<string>;
	StartTimeUnix: Generated<DateTime64>;
	Sum: Generated<number>;
	TimeUnix: Generated<DateTime64>;
}

export const OtelMetricsSum = z.object({
	ResourceAttributes: z.record(z.string(), z.string()),
	ResourceSchemaUrl: z.string(),
	ScopeName: z.string(),
	ScopeVersion: z.string(),
	ScopeAttributes: z.record(z.string(), z.string()),
	ScopeDroppedAttrCount: z.coerce.number(),
	ScopeSchemaUrl: z.string(),
	ServiceName: z.string(),
	MetricName: z.string(),
	MetricDescription: z.string(),
	MetricUnit: z.string(),
	Attributes: z.record(z.string(), z.string()),
	StartTimeUnix: DateTime64Schema,
	TimeUnix: DateTime64Schema,
	Value: z.coerce.number(),
	Flags: z.coerce.number(),
	"Exemplars.FilteredAttributes": z.array(z.record(z.string(), z.string())),
	"Exemplars.TimeUnix": DateTime64ArraySchema,
	"Exemplars.Value": z.array(z.coerce.number()),
	"Exemplars.SpanId": z.array(z.string()),
	"Exemplars.TraceId": z.array(z.string()),
	AggregationTemporality: z.coerce.number(),
	IsMonotonic: z.boolean(),
});
export interface OtelMetricsSum {
	AggregationTemporality: Generated<number>;
	Attributes: Generated<StringMap>;
	"Exemplars.FilteredAttributes": Generated<StringMapArray>;
	"Exemplars.SpanId": Generated<StringArray>;
	"Exemplars.TimeUnix": Generated<DateTime64Array>;
	"Exemplars.TraceId": Generated<StringArray>;
	"Exemplars.Value": Generated<NumberArray>;
	Flags: Generated<number>;
	IsMonotonic: Generated<boolean>;
	MetricDescription: Generated<string>;
	MetricName: Generated<string>;
	MetricUnit: Generated<string>;
	ResourceAttributes: Generated<StringMap>;
	ResourceSchemaUrl: Generated<string>;
	ScopeAttributes: Generated<StringMap>;
	ScopeDroppedAttrCount: Generated<number>;
	ScopeName: Generated<string>;
	ScopeSchemaUrl: Generated<string>;
	ScopeVersion: Generated<string>;
	ServiceName: Generated<string>;
	StartTimeUnix: Generated<DateTime64>;
	TimeUnix: Generated<DateTime64>;
	Value: Generated<number>;
}

export const OtelMetricsSummary = z.object({
	ResourceAttributes: z.record(z.string(), z.string()),
	ResourceSchemaUrl: z.string(),
	ScopeName: z.string(),
	ScopeVersion: z.string(),
	ScopeAttributes: z.record(z.string(), z.string()),
	ScopeDroppedAttrCount: z.coerce.number(),
	ScopeSchemaUrl: z.string(),
	ServiceName: z.string(),
	MetricName: z.string(),
	MetricDescription: z.string(),
	MetricUnit: z.string(),
	Attributes: z.record(z.string(), z.string()),
	StartTimeUnix: DateTime64Schema,
	TimeUnix: DateTime64Schema,
	Count: z.coerce.number(),
	Sum: z.coerce.number(),
	"ValueAtQuantiles.Quantile": z.array(z.coerce.number()),
	"ValueAtQuantiles.Value": z.array(z.coerce.number()),
	Flags: z.coerce.number(),
});
export interface OtelMetricsSummary {
	Attributes: Generated<StringMap>;
	Count: Generated<number>;
	Flags: Generated<number>;
	MetricDescription: Generated<string>;
	MetricName: Generated<string>;
	MetricUnit: Generated<string>;
	ResourceAttributes: Generated<StringMap>;
	ResourceSchemaUrl: Generated<string>;
	ScopeAttributes: Generated<StringMap>;
	ScopeDroppedAttrCount: Generated<number>;
	ScopeName: Generated<string>;
	ScopeSchemaUrl: Generated<string>;
	ScopeVersion: Generated<string>;
	ServiceName: Generated<string>;
	StartTimeUnix: Generated<DateTime64>;
	Sum: Generated<number>;
	TimeUnix: Generated<DateTime64>;
	"ValueAtQuantiles.Quantile": Generated<NumberArray>;
	"ValueAtQuantiles.Value": Generated<NumberArray>;
}

export const OtelTraces = z.object({
	Timestamp: DateTime64Schema,
	TraceId: z.string(),
	SpanId: z.string(),
	ParentSpanId: z.string(),
	TraceState: z.string(),
	SpanName: z.string(),
	SpanKind: z.string(),
	ServiceName: z.string(),
	ResourceAttributes: JsonValueSchema,
	ResourceAttributesKeys: z.array(z.string()),
	ScopeName: z.string(),
	ScopeVersion: z.string(),
	SpanAttributes: JsonValueSchema,
	SpanAttributesKeys: z.array(z.string()),
	Duration: z.coerce.number(),
	StatusCode: z.string(),
	StatusMessage: z.string(),
	"Events.Timestamp": DateTime64ArraySchema,
	"Events.Name": z.array(z.string()),
	"Events.Attributes": z.array(JsonValueSchema),
	"Links.TraceId": z.array(z.string()),
	"Links.SpanId": z.array(z.string()),
	"Links.TraceState": z.array(z.string()),
	"Links.Attributes": z.array(JsonValueSchema),
});
export interface OtelTraces {
	Duration: Generated<number>;
	"Events.Attributes": Generated<JsonArray>;
	"Events.Name": Generated<StringArray>;
	"Events.Timestamp": Generated<DateTime64Array>;
	"Links.Attributes": Generated<JsonArray>;
	"Links.SpanId": Generated<StringArray>;
	"Links.TraceId": Generated<StringArray>;
	"Links.TraceState": Generated<StringArray>;
	ParentSpanId: Generated<string>;
	ResourceAttributes: Generated<Json>;
	ResourceAttributesKeys: Generated<StringArray>;
	ScopeName: Generated<string>;
	ScopeVersion: Generated<string>;
	ServiceName: Generated<string>;
	SpanAttributes: Generated<Json>;
	SpanAttributesKeys: Generated<StringArray>;
	SpanId: Generated<string>;
	SpanKind: Generated<string>;
	SpanName: Generated<string>;
	StatusCode: Generated<string>;
	StatusMessage: Generated<string>;
	Timestamp: Generated<DateTime64>;
	TraceId: Generated<string>;
	TraceState: Generated<string>;
}

export const OtelTracesTraceIdTs = z.object({
	TraceId: z.string(),
	Start: z.coerce.date(),
	End: z.coerce.date(),
});
export interface OtelTracesTraceIdTs {
	End: Generated<Date>;
	Start: Generated<Date>;
	TraceId: Generated<string>;
}

export const OtelTracesTraceIdTsMv = z.object({
	TraceId: z.string(),
	Start: DateTime64Schema,
	End: DateTime64Schema,
});
export interface OtelTracesTraceIdTsMv {
	End: Generated<DateTime64>;
	Start: Generated<DateTime64>;
	TraceId: Generated<string>;
}

export const DB = z.object({
	otel_logs: OtelLogs,
	otel_metrics_exponential_histogram: OtelMetricsExponentialHistogram,
	otel_metrics_gauge: OtelMetricsGauge,
	otel_metrics_histogram: OtelMetricsHistogram,
	otel_metrics_sum: OtelMetricsSum,
	otel_metrics_summary: OtelMetricsSummary,
	otel_traces: OtelTraces,
	otel_traces_trace_id_ts: OtelTracesTraceIdTs,
	otel_traces_trace_id_ts_mv: OtelTracesTraceIdTsMv,
});
export interface DB {
	otel_logs: OtelLogs;
	otel_metrics_exponential_histogram: OtelMetricsExponentialHistogram;
	otel_metrics_gauge: OtelMetricsGauge;
	otel_metrics_histogram: OtelMetricsHistogram;
	otel_metrics_sum: OtelMetricsSum;
	otel_metrics_summary: OtelMetricsSummary;
	otel_traces: OtelTraces;
	otel_traces_trace_id_ts: OtelTracesTraceIdTs;
	otel_traces_trace_id_ts_mv: OtelTracesTraceIdTsMv;
}
