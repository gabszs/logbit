import { describe, expect, it } from "bun:test";
import type {
	RowIdentity,
	RowTracePanelAvailable,
} from "@/web/components/data-row-side-panel";
import {
	TRACE_ALIASES,
	type TraceWaterfallNodeSelection,
} from "@/web/components/trace-waterfall";
import type { LogSourceEntity, TraceSourceEntity } from "@/web/lib/sources";

type LogsRowPanelModule = typeof import("./logs-row-panel");

let logsRowPanelPromise: Promise<LogsRowPanelModule> | null = null;

function loadLogsRowPanel() {
	Object.assign(import.meta.env, { VITE_SERVER_URL: "http://localhost" });
	logsRowPanelPromise ??= import("./logs-row-panel");
	return logsRowPanelPromise;
}

const logSource = {
	id: "log-source",
	name: "Logs",
	type: "log",
	organizationId: "org",
	connectionId: "log-connection",
	createdAt: new Date("2026-05-08T00:00:00.000Z"),
	updatedAt: new Date("2026-05-08T00:00:00.000Z"),
	config: {
		database: "logs_db",
		table: "logs",
		defaultOrderByQuery: "Timestamp DESC",
		resourceAttributesField: "ResourceAttributes",
		timestampQueryField: "Timestamp",
		displayedTimestampField: "Timestamp",
		serviceNameField: "ServiceName",
		traceIdField: "TraceId",
		spanIdField: "SpanId",
		luceneImplicitColumnField: "Body",
		queryRangeLimit: {
			lookbackDays: 7,
			forwardDays: 2,
		},
		querySettings: [],
		metricSourceId: null,
		materializedViews: [],
		highlightedRowAttributeExpressions: [],
		highlightedTraceAttributeExpressions: [],
		defaultSelectQuery: "Timestamp, ServiceName, SeverityText, Body",
		severityField: "SeverityText",
		logAttributesField: "LogAttributes",
		bodyField: "Body",
		traceSourceId: "trace-source",
	},
} satisfies LogSourceEntity;

const traceSource = {
	id: "trace-source",
	name: "Traces",
	type: "trace",
	organizationId: "org",
	connectionId: "trace-connection",
	createdAt: new Date("2026-05-08T00:00:00.000Z"),
	updatedAt: new Date("2026-05-08T00:00:00.000Z"),
	config: {
		database: "traces_db",
		table: "spans",
		defaultOrderByQuery: "Timestamp DESC",
		resourceAttributesField: "ResourceAttributes",
		timestampQueryField: "Timestamp",
		displayedTimestampField: "Timestamp",
		serviceNameField: "ServiceName",
		traceIdField: "TraceId",
		luceneImplicitColumnField: "SpanName",
		queryRangeLimit: {
			lookbackDays: 7,
			forwardDays: 2,
		},
		querySettings: [],
		metricSourceId: null,
		materializedViews: [],
		highlightedRowAttributeExpressions: [],
		highlightedTraceAttributeExpressions: [],
		defaultSelectQuery: "Timestamp, ServiceName, SpanName",
		sampleRateField: null,
		spanAttributesField: "SpanAttributes",
		durationField: "Duration",
		durationPrecisionField: 9,
		parentSpanIdField: "ParentSpanId",
		spanEventsField: "Events",
		spanIdField: "SpanId",
		spanKindField: "SpanKind",
		spanNameField: "SpanName",
		statusCodeField: "StatusCode",
		statusMessageField: "StatusMessage",
		bodyField: "SpanName",
		logSourceId: "log-source",
	},
} satisfies TraceSourceEntity;

const baseIdentity = {
	sourceId: logSource.id,
	connectionId: logSource.connectionId,
	tableLabel: "Logs",
	rowWhere: "toString(TraceId) = 'trace-1'",
	selectedRowKey: "log-source:trace-1",
	aliasWith: [],
} satisfies RowIdentity;

const tracePanel = {
	kind: "available",
	traceId: "trace-1",
	traceSourceId: traceSource.id,
	logSourceId: logSource.id,
	traceSourceName: "Traces",
	logSourceName: "Logs",
} satisfies RowTracePanelAvailable;

async function createAdapter() {
	const { createLogsRowPanelAdapter } = await loadLogsRowPanel();
	return createLogsRowPanelAdapter(logSource, [logSource, traceSource]);
}

describe("trace node row identity", () => {
	it("builds a log source identity for clicked log nodes", async () => {
		const adapter = await createAdapter();
		const selection = {
			kind: "log",
			nodeId: "log:span-1:0",
			traceId: "trace-1",
			spanId: "span-1",
			row: {
				[TRACE_ALIASES.traceId]: "trace-1",
				[TRACE_ALIASES.spanId]: "span-1",
				[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
				[TRACE_ALIASES.body]: "clicked log",
				[TRACE_ALIASES.severityText]: "ERROR",
			},
		} satisfies TraceWaterfallNodeSelection;

		const identity = adapter.getTraceNodeRowIdentity?.(
			baseIdentity,
			tracePanel,
			selection,
		);

		expect(identity?.sourceId).toBe("log-source");
		expect(identity?.connectionId).toBe("log-connection");
		expect(identity?.rowWhere).toContain("TraceId = 'trace-1'");
		expect(identity?.rowWhere).toContain("SpanId = 'span-1'");
		expect(identity?.rowWhere).toContain("Body = 'clicked log'");
		expect(identity?.rowWhere).toContain(
			"toString(Timestamp) = '2026-05-08 10:00:00.000000010'",
		);
	});

	it("builds a trace source identity for clicked span nodes", async () => {
		const adapter = await createAdapter();
		const selection = {
			kind: "span",
			nodeId: "span:span-1",
			traceId: "trace-1",
			spanId: "span-1",
			row: {
				[TRACE_ALIASES.traceId]: "trace-1",
				[TRACE_ALIASES.spanId]: "span-1",
				[TRACE_ALIASES.parentSpanId]: "root",
				[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
				[TRACE_ALIASES.name]: "GET /api",
				[TRACE_ALIASES.statusCode]: "OK",
			},
		} satisfies TraceWaterfallNodeSelection;

		const identity = adapter.getTraceNodeRowIdentity?.(
			baseIdentity,
			tracePanel,
			selection,
		);

		expect(identity?.sourceId).toBe("trace-source");
		expect(identity?.connectionId).toBe("trace-connection");
		expect(identity?.rowWhere).toContain("TraceId = 'trace-1'");
		expect(identity?.rowWhere).toContain("SpanId = 'span-1'");
		expect(identity?.rowWhere).toContain("SpanName = 'GET /api'");
		expect(identity?.rowWhere).toContain(
			"toString(Timestamp) = '2026-05-08 10:00:00.000000000'",
		);
	});

	it("does not create predicates for undefined values", async () => {
		const adapter = await createAdapter();
		const selection = {
			kind: "log",
			nodeId: "log:span-1:0",
			traceId: "trace-1",
			spanId: "span-1",
			row: {
				[TRACE_ALIASES.traceId]: "trace-1",
				[TRACE_ALIASES.spanId]: undefined,
				[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
			},
		} satisfies TraceWaterfallNodeSelection;

		const identity = adapter.getTraceNodeRowIdentity?.(
			baseIdentity,
			tracePanel,
			selection,
		);

		expect(identity?.rowWhere).not.toContain("undefined");
	});
});

describe("row field resolution", () => {
	it("uses body text and Log Values for log rows", async () => {
		const { resolveLogsRowFields } = await loadLogsRowPanel();
		const adapter = await createAdapter();
		const row = {
			[TRACE_ALIASES.body]: "log body",
			[TRACE_ALIASES.severityText]: "INFO",
		};
		const fields = resolveLogsRowFields(logSource, row);

		expect(fields.body).toBe("log body");
		expect(fields.bodyLabel).toBe("Body");
		expect(adapter.getColumnValuesLabel?.(row, fields)).toBe("Log Values");
	});

	it("uses SpanName text and Span Values for span rows", async () => {
		const { resolveLogsRowFields } = await loadLogsRowPanel();
		const adapter = await createAdapter();
		const row = {
			[TRACE_ALIASES.name]: "GET /api",
			[TRACE_ALIASES.spanId]: "span-1",
			[TRACE_ALIASES.spanKind]: "SERVER",
			[TRACE_ALIASES.statusCode]: "ERROR",
		};
		const fields = resolveLogsRowFields(logSource, row);

		expect(fields.body).toBe("GET /api");
		expect(fields.bodyLabel).toBe("SpanName");
		expect(fields.levelText).toBe("SERVER");
		expect(fields.severityText).toBe("ERROR");
		expect(adapter.getColumnValuesLabel?.(row, fields)).toBe("Span Values");
	});
});
