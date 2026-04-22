import { z } from "zod";

export const chLogsConfigSchema = z.object({
    defaultSelectQuery: z.string().min(1, { message: "Default select query is required" }).default("Timestamp, ServiceName as service, SeverityText as level, Body"),
    defaultOrderByQuery: z.string().min(1, { message: "Default order by query is required" }).default("Timestamp DESC"),
    severityField: z.string().min(1, { message: "Severity field is required" }).default("SeverityText"),
    resourceAttributesField: z.string().min(1, { message: "Resource attributes field is required" }).default("ResourceAttributes"),
    logAttributesField: z.string().min(1, { message: "Log attributes field is required" }).default("LogAttributes"),
    timestampField: z.string().min(1, { message: "Timestamp field is required" }).default("Timestamp"),
    serviceNameField: z.string().min(1, { message: "Service name field is required" }).default("ServiceName"),
    bodyField: z.string().min(1, { message: "Body field is required" }).default("Body"),
    traceIdField: z.string().min(1, { message: "Trace ID field is required" }).default("TraceId"),
    spanIdField: z.string().min(1, { message: "Span ID field is required" }).default("SpanId"),
    luceneImplicitColumnField: z.string().min(1, { message: "Lucene implicit column field is required" }).default("Body"),

    traceSourceId: z.uuidv7().nullable(),
    metricSourceId: z.uuidv7().nullable(),
    // profilesSourceId: z.uuidv7().nullable(),
});

export type ChLogsConfigType = z.infer<typeof chLogsConfigSchema>;
