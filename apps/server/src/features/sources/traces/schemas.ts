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

	logSourceId: z.uuidv7().nullable().default(null),
	// profilesSourceId: z.uuidv7().nullable(),
});
export type TracesConfigType = z.infer<typeof tracesConfigSchema>;

export const upsertTracesConfigSchema =
	tracesConfigSchema.openapi("UpsertTracesConfig");
