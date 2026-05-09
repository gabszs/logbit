import type {
	ResolvedRowFields,
	RowIdentity,
	RowPanelAdapter,
	RowPanelAttribute,
	RowPanelOverview,
	RowTracePanelAvailable,
} from "@/web/components/data-row-side-panel";
import {
	isDataRecord,
	tryParseJsonString,
} from "@/web/components/data-row-side-panel/value-formatting";
import type { TraceWaterfallInitialHighlightHint } from "@/web/components/trace-waterfall";
import { TRACE_ALIASES } from "@/web/components/trace-waterfall";
import {
	createProxyClient,
	executeClickhouseJsonQuery,
	formatClickhouseQueryError,
} from "@/web/lib/clickhouse-client";
import type { DataRow } from "@/web/lib/data-row";
import {
	isTraceSource,
	type LogSourceEntity,
	type SourceEntity,
	type TraceSourceEntity,
} from "@/web/lib/sources";
import {
	escapeSqlString,
	normalizeSqlExpression,
	quoteIdentifier,
} from "./logs-queries";

export const LOGLOG_ROW_SELECTOR_PREFIX = "__loglog_row_selector_";

type LogsSelectorRole =
	| "timestamp"
	| "body"
	| "severityText"
	| "serviceName"
	| "traceId"
	| "spanId"
	| "resourceAttributes"
	| "logAttributes";

type LogsRowSelector = {
	alias: string;
	expression: string;
	role: LogsSelectorRole;
	includeInRowWhere: boolean;
	includeInTableSelect: boolean;
};

const LOG_SELECTOR_CONFIGS: Array<{
	role: LogsSelectorRole;
	configKey:
		| "timestampQueryField"
		| "bodyField"
		| "severityField"
		| "serviceNameField"
		| "traceIdField"
		| "spanIdField"
		| "resourceAttributesField"
		| "logAttributesField";
	fallbackExpression: string;
	includeInRowWhere: boolean;
	includeInTableSelect: boolean;
}> = [
	{
		role: "timestamp",
		configKey: "timestampQueryField",
		fallbackExpression: "Timestamp",
		includeInRowWhere: true,
		includeInTableSelect: true,
	},
	{
		role: "body",
		configKey: "bodyField",
		fallbackExpression: "Body",
		includeInRowWhere: true,
		includeInTableSelect: true,
	},
	{
		role: "severityText",
		configKey: "severityField",
		fallbackExpression: "SeverityText",
		includeInRowWhere: true,
		includeInTableSelect: true,
	},
	{
		role: "serviceName",
		configKey: "serviceNameField",
		fallbackExpression: "ServiceName",
		includeInRowWhere: true,
		includeInTableSelect: true,
	},
	{
		role: "traceId",
		configKey: "traceIdField",
		fallbackExpression: "TraceId",
		includeInRowWhere: true,
		includeInTableSelect: true,
	},
	{
		role: "spanId",
		configKey: "spanIdField",
		fallbackExpression: "SpanId",
		includeInRowWhere: true,
		includeInTableSelect: true,
	},
	{
		role: "resourceAttributes",
		configKey: "resourceAttributesField",
		fallbackExpression: "ResourceAttributes",
		includeInRowWhere: false,
		includeInTableSelect: false,
	},
	{
		role: "logAttributes",
		configKey: "logAttributesField",
		fallbackExpression: "LogAttributes",
		includeInRowWhere: false,
		includeInTableSelect: false,
	},
];

const FIELD_FALLBACKS = {
	timestamp: [
		TRACE_ALIASES.timestamp,
		"Timestamp",
		"timestamp",
		"time",
		"Time",
		"ts",
	],
	traceId: [TRACE_ALIASES.traceId, "TraceId", "traceId", "trace_id"],
	spanId: [TRACE_ALIASES.spanId, "SpanId", "spanId", "span_id"],
	serviceName: [
		TRACE_ALIASES.serviceName,
		"ServiceName",
		"serviceName",
		"service_name",
		"service",
	],
	severityText: [
		TRACE_ALIASES.severityText,
		"SeverityText",
		"severityText",
		"severity",
		"level",
		"Level",
	],
	severityNumber: [
		TRACE_ALIASES.severityNumber,
		"SeverityNumber",
		"severityNumber",
		"severity_number",
	],
	body: [TRACE_ALIASES.body, "Body", "body", "message", "Message", "msg"],
	resourceAttributes: [
		"ResourceAttributes",
		"resourceAttributes",
		"resource_attributes",
	],
	logAttributes: ["LogAttributes", "logAttributes", "log_attributes"],
	spanAttributes: ["SpanAttributes", "spanAttributes", "span_attributes"],
} as const;

const TOP_LEVEL_FIELD_FALLBACKS = {
	SpanName: [TRACE_ALIASES.name, "SpanName", "spanName", "span_name"],
	Duration: [
		TRACE_ALIASES.duration,
		"Duration",
		"duration",
		"DurationNano",
		"durationNano",
	],
	StatusCode: [
		TRACE_ALIASES.statusCode,
		"StatusCode",
		"statusCode",
		"status_code",
	],
	StatusMessage: [
		TRACE_ALIASES.statusMessage,
		"StatusMessage",
		"statusMessage",
		"status_message",
	],
	SpanKind: [TRACE_ALIASES.spanKind, "SpanKind", "spanKind", "span_kind"],
	ParentSpanId: [
		TRACE_ALIASES.parentSpanId,
		"ParentSpanId",
		"parentSpanId",
		"parent_span_id",
	],
	ScopeName: ["ScopeName", "scopeName", "scope_name"],
	ScopeVersion: ["ScopeVersion", "scopeVersion", "scope_version"],
} as const;

const SPAN_ROW_FIELD_HINTS = [
	TRACE_ALIASES.name,
	"SpanName",
	"spanName",
	"span_name",
	TRACE_ALIASES.spanKind,
	"SpanKind",
	"spanKind",
	"span_kind",
	TRACE_ALIASES.parentSpanId,
	"ParentSpanId",
	"parentSpanId",
	"parent_span_id",
	TRACE_ALIASES.duration,
	"Duration",
	"duration",
	"DurationNano",
	"durationNano",
	TRACE_ALIASES.statusCode,
	"StatusCode",
	"statusCode",
	TRACE_ALIASES.statusMessage,
	"StatusMessage",
	"statusMessage",
] as const;

const DEFAULT_TRACE_WATERFALL_LIMIT = 5000;
const DEFAULT_QUERY_RANGE_LIMIT = {
	lookbackDays: 7,
	forwardDays: 2,
} as const;

function getLogsRowSelectors(source: LogSourceEntity): LogsRowSelector[] {
	return LOG_SELECTOR_CONFIGS.map((config, index) => {
		const configuredExpression = normalizeSqlExpression(
			source.config[config.configKey],
		);
		const expression = configuredExpression || config.fallbackExpression;
		return {
			alias: `${LOGLOG_ROW_SELECTOR_PREFIX}${index}`,
			expression,
			role: config.role,
			includeInRowWhere: config.includeInRowWhere,
			includeInTableSelect: config.includeInTableSelect,
		};
	}).filter((selector) => selector.expression.trim().length > 0);
}

function getTraceWaterfallLimit() {
	const env = (
		import.meta as ImportMeta & {
			env?: Record<string, string | undefined>;
		}
	).env;
	const parsed = Number(env?.VITE_LOGLOG_TRACE_WATERFALL_LIMIT);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return DEFAULT_TRACE_WATERFALL_LIMIT;
	}
	return parsed;
}

export function getLogsRowSelectorAliases(source: LogSourceEntity) {
	return getLogsRowSelectors(source).map((selector) => selector.alias);
}

export function getLogsRowSelectorSelects(source: LogSourceEntity) {
	return getLogsRowSelectors(source)
		.filter((selector) => selector.includeInTableSelect)
		.map((selector) => ({
			valueExpression: selector.expression,
			alias: selector.alias,
		}));
}

function isScalarPredicateValue(value: unknown) {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value == null
	);
}

function unquoteSimpleIdentifier(expression: string) {
	const trimmed = normalizeSqlExpression(expression);
	if (/^`[^`]+`$/u.test(trimmed)) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function isSimpleIdentifierExpression(expression: string) {
	return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(unquoteSimpleIdentifier(expression));
}

function dateFromValue(value: unknown) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value !== "string" && typeof value !== "number") return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function predicateForSimpleExpression(
	expression: string,
	value: unknown,
	role?: LogsSelectorRole,
) {
	if (!isSimpleIdentifierExpression(expression)) return null;
	if (role === "timestamp") {
		return null;
	}
	if (typeof value === "number") return `${expression} = ${value}`;
	if (typeof value === "boolean") return `${expression} = ${value ? 1 : 0}`;
	return `${expression} = '${escapeSqlString(String(value))}'`;
}

function predicateForSelector(selector: LogsRowSelector, value: unknown) {
	if (!isScalarPredicateValue(value)) return null;
	if (value == null) return `isNull(${selector.expression})`;
	const typedPredicate = predicateForSimpleExpression(
		selector.expression,
		value,
		selector.role,
	);
	if (typedPredicate) return typedPredicate;
	return `toString(${selector.expression}) = '${escapeSqlString(String(value))}'`;
}

function predicateForExpression(
	expression: string,
	value: unknown,
	role?: LogsSelectorRole,
) {
	const normalizedExpression = normalizeSqlExpression(expression);
	if (!normalizedExpression || value === undefined) return null;
	if (!isScalarPredicateValue(value)) return null;
	if (value === null) return `isNull(${normalizedExpression})`;
	const typedPredicate = predicateForSimpleExpression(
		normalizedExpression,
		value,
		role,
	);
	if (typedPredicate) return typedPredicate;
	return `toString(${normalizedExpression}) = '${escapeSqlString(String(value))}'`;
}

function stripTechnicalAliases(row: DataRow): DataRow {
	return Object.fromEntries(
		Object.entries(row).filter(
			([key]) =>
				!key.startsWith(LOGLOG_ROW_SELECTOR_PREFIX) &&
				!key.startsWith("__loglog_trace_"),
		),
	);
}

function getSourceTableLabel(source: LogSourceEntity) {
	return `${source.name} · ${source.config.database ?? "?"}.${source.config.table ?? "?"}`;
}

export function buildLogsRowIdentity(
	source: LogSourceEntity,
	row: DataRow,
): RowIdentity | null {
	const predicates = getLogsRowSelectors(source)
		.filter((selector) => selector.includeInRowWhere)
		.map((selector) => predicateForSelector(selector, row[selector.alias]))
		.filter((predicate): predicate is string => predicate != null);

	if (predicates.length === 0) return null;

	const rowWhere = predicates.join(" AND ");
	return {
		sourceId: source.id,
		connectionId: source.connectionId,
		tableLabel: getSourceTableLabel(source),
		rowWhere,
		selectedRowKey: `${source.id}:${rowWhere}`,
		aliasWith: [],
	};
}

function buildLogsRowDetailQuery(source: LogSourceEntity, rowWhere: string) {
	if (!source.config.database || !source.config.table) {
		throw new Error("Log source is missing database or table configuration");
	}

	const selectorSelects = getLogsRowSelectorSelects(source)
		.map((selector) => {
			const valueExpression = normalizeSqlExpression(selector.valueExpression);
			if (!valueExpression) return null;
			return `${valueExpression} AS ${quoteIdentifier(selector.alias)}`;
		})
		.filter((selector): selector is string => selector != null);

	return [
		`SELECT ${["*", ...selectorSelects].join(", ")}`,
		`FROM ${quoteIdentifier(source.config.database)}.${quoteIdentifier(source.config.table)}`,
		`WHERE ${rowWhere}`,
		"LIMIT 2",
	].join("\n");
}

function findKeyCaseInsensitive(row: DataRow, keys: readonly string[]) {
	const rowKeys = Object.keys(row);
	for (const expectedKey of keys) {
		const foundKey = rowKeys.find(
			(rowKey) => rowKey.toLowerCase() === expectedKey.toLowerCase(),
		);
		if (foundKey) return foundKey;
	}
	return null;
}

function valueForRole(
	source: LogSourceEntity,
	row: DataRow,
	role: LogsSelectorRole,
	fallbackKeys: readonly string[],
) {
	const selector = getLogsRowSelectors(source).find(
		(candidate) => candidate.role === role,
	);
	if (selector && row[selector.alias] !== undefined) {
		return row[selector.alias];
	}

	const fallbackKey = findKeyCaseInsensitive(row, fallbackKeys);
	return fallbackKey ? row[fallbackKey] : undefined;
}

function fallbackValue(row: DataRow, fallbackKeys: readonly string[]) {
	const fallbackKey = findKeyCaseInsensitive(row, fallbackKeys);
	return fallbackKey ? row[fallbackKey] : undefined;
}

function hasMeaningfulValue(value: unknown) {
	return value != null && String(value).trim().length > 0;
}

function meaningfulString(value: unknown) {
	if (!hasMeaningfulValue(value)) return undefined;
	return String(value).trim();
}

function expressionLooksLikeSpanName(expression: string | null | undefined) {
	return normalizeSqlExpression(expression)
		.replaceAll("`", "")
		.replaceAll('"', "")
		.toLowerCase()
		.includes("spanname");
}

function isSpanLikeRow(source: LogSourceEntity, row: DataRow) {
	const tableName = source.config.table?.toLowerCase() ?? "";
	if (tableName.includes("trace") || tableName.includes("span")) return true;
	if (expressionLooksLikeSpanName(source.config.bodyField)) return true;

	return SPAN_ROW_FIELD_HINTS.some((fieldName) => {
		const rowKey = findKeyCaseInsensitive(row, [fieldName]);
		return rowKey ? hasMeaningfulValue(row[rowKey]) : false;
	});
}

function getLogsColumnValuesLabel(source: LogSourceEntity, row: DataRow) {
	return isSpanLikeRow(source, row) ? "Span Values" : "Log Values";
}

function sourceTableLabel(source: SourceEntity) {
	return `${source.name} · ${source.config.database ?? "?"}.${source.config.table ?? "?"}`;
}

function pushAttribute(
	attributes: RowPanelAttribute[],
	key: string,
	value: unknown,
) {
	if (!hasMeaningfulValue(value)) return;
	attributes.push({ key, value });
}

function getAttributesObject(value: unknown): DataRow {
	const parsed = tryParseJsonString(value);
	return isDataRecord(parsed) ? parsed : {};
}

function valueForSimpleExpression(
	source: LogSourceEntity,
	row: DataRow,
	role: LogsSelectorRole,
	fallbackKeys: readonly string[],
) {
	const selector = getLogsRowSelectors(source).find(
		(candidate) => candidate.role === role,
	);
	if (selector && row[selector.alias] !== undefined) {
		return row[selector.alias];
	}
	return fallbackValue(row, fallbackKeys);
}

function attributesFromValue(value: unknown): RowPanelAttribute[] {
	return Object.entries(getAttributesObject(value))
		.filter(([, attributeValue]) => hasMeaningfulValue(attributeValue))
		.map(([key, attributeValue]) => ({
			key,
			value: attributeValue,
		}));
}

function getLogsOverview(
	source: LogSourceEntity,
	row: DataRow,
	fields: ResolvedRowFields,
): RowPanelOverview {
	const topLevelAttributes: RowPanelAttribute[] = [];
	pushAttribute(topLevelAttributes, "Timestamp", fields.timestamp);
	pushAttribute(topLevelAttributes, "ServiceName", fields.serviceName);
	const severityValue = hasMeaningfulValue(fields.severityText)
		? fields.severityText
		: fields.severityNumber;
	pushAttribute(
		topLevelAttributes,
		hasMeaningfulValue(fields.severityText) ? "SeverityText" : "SeverityNumber",
		severityValue,
	);
	pushAttribute(topLevelAttributes, "TraceId", fields.traceId);
	pushAttribute(topLevelAttributes, "SpanId", fields.spanId);

	for (const [label, fallbackKeys] of Object.entries(
		TOP_LEVEL_FIELD_FALLBACKS,
	)) {
		pushAttribute(topLevelAttributes, label, fallbackValue(row, fallbackKeys));
	}

	const isSpan = isSpanLikeRow(source, row);
	const eventAttributes = isSpan
		? fallbackValue(row, FIELD_FALLBACKS.spanAttributes)
		: valueForSimpleExpression(
				source,
				row,
				"logAttributes",
				FIELD_FALLBACKS.logAttributes,
			);
	const resourceAttributes = valueForSimpleExpression(
		source,
		row,
		"resourceAttributes",
		FIELD_FALLBACKS.resourceAttributes,
	);

	return {
		sections: [
			{
				id: "top-level-attributes",
				title: "Top Level Attributes",
				attributes: topLevelAttributes,
			},
			{
				id: "event-attributes",
				title: isSpan ? "Span Attributes" : "Log Attributes",
				attributes: attributesFromValue(eventAttributes),
			},
			{
				id: "resource-attributes",
				title: "Resource Attributes",
				attributes: attributesFromValue(resourceAttributes),
			},
		],
	};
}

export function resolveLogsRowFields(
	source: LogSourceEntity,
	row: DataRow,
): ResolvedRowFields {
	const isSpan = isSpanLikeRow(source, row);
	return {
		timestamp: valueForRole(
			source,
			row,
			"timestamp",
			FIELD_FALLBACKS.timestamp,
		),
		traceId: valueForRole(source, row, "traceId", FIELD_FALLBACKS.traceId),
		spanId: valueForRole(source, row, "spanId", FIELD_FALLBACKS.spanId),
		serviceName: valueForRole(
			source,
			row,
			"serviceName",
			FIELD_FALLBACKS.serviceName,
		),
		severityText: isSpan
			? (fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.StatusCode) ??
				fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.StatusMessage))
			: valueForRole(source, row, "severityText", FIELD_FALLBACKS.severityText),
		severityNumber: fallbackValue(row, FIELD_FALLBACKS.severityNumber),
		body: isSpan
			? (fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.SpanName) ??
				valueForRole(source, row, "body", FIELD_FALLBACKS.body))
			: valueForRole(source, row, "body", FIELD_FALLBACKS.body),
		bodyLabel: isSpan ? "SpanName" : "Body",
	};
}

function traceSetupDescription(source: LogSourceEntity) {
	return [
		"Trace attributes were detected on this row, but no correlated trace source is configured.",
		`Open the source settings for "${source.name}" and set Trace source to the ClickHouse source that contains spans for the same TraceId.`,
	].join("\n");
}

function unavailableTraceSourceDescription(
	source: LogSourceEntity,
	traceSourceId: string,
) {
	return [
		`This log source points to trace source ${traceSourceId}, but that source is not available in the current source list.`,
		`Open the source settings for "${source.name}" and choose a valid trace source.`,
	].join("\n");
}

function missingTraceIdDescription(source: LogSourceEntity) {
	return [
		"Trace/span attributes were detected, but this row does not contain a TraceId value.",
		`Check the Trace ID field configured for "${source.name}" before opening the waterfall.`,
	].join("\n");
}

function buildTraceInitialHighlightHint(
	source: LogSourceEntity,
	row: DataRow,
	fields: ResolvedRowFields,
): TraceWaterfallInitialHighlightHint {
	const isSpan = isSpanLikeRow(source, row);
	return {
		kind: isSpan ? "span" : "log",
		traceId: meaningfulString(fields.traceId),
		spanId: meaningfulString(fields.spanId),
		parentSpanId: isSpan
			? meaningfulString(
					fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.ParentSpanId),
				)
			: undefined,
		timestamp: fields.timestamp,
		name: isSpan
			? meaningfulString(fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.SpanName))
			: undefined,
		body: isSpan ? undefined : meaningfulString(fields.body),
		severityText: isSpan ? undefined : meaningfulString(fields.severityText),
		serviceName: meaningfulString(fields.serviceName),
	};
}

function findTraceSource(
	allSources: SourceEntity[],
	traceSourceId: string | null | undefined,
) {
	if (!traceSourceId) return null;
	const source = allSources.find((candidate) => candidate.id === traceSourceId);
	return source && isTraceSource(source) ? source : null;
}

function configuredExpression(
	value: string | null | undefined,
	fallback: string,
) {
	return normalizeSqlExpression(value) || fallback;
}

function aliasedSelect(valueExpression: string, alias: string) {
	return `${valueExpression} AS ${quoteIdentifier(alias)}`;
}

function getTraceFieldExpressions(source: TraceSourceEntity) {
	return {
		timestamp: configuredExpression(
			source.config.timestampQueryField,
			"Timestamp",
		),
		traceId: configuredExpression(source.config.traceIdField, "TraceId"),
		spanId: configuredExpression(source.config.spanIdField, "SpanId"),
		parentSpanId: configuredExpression(
			source.config.parentSpanIdField,
			"ParentSpanId",
		),
		serviceName: configuredExpression(
			source.config.serviceNameField,
			"ServiceName",
		),
		name: configuredExpression(source.config.spanNameField, "SpanName"),
		duration: configuredExpression(source.config.durationField, "Duration"),
		statusCode: configuredExpression(
			source.config.statusCodeField,
			"StatusCode",
		),
		statusMessage: configuredExpression(
			source.config.statusMessageField,
			"StatusMessage",
		),
		spanKind: configuredExpression(source.config.spanKindField, "SpanKind"),
	};
}

function getLogFieldExpressions(source: LogSourceEntity) {
	return {
		timestamp: configuredExpression(
			source.config.timestampQueryField,
			"Timestamp",
		),
		traceId: configuredExpression(source.config.traceIdField, "TraceId"),
		spanId: configuredExpression(source.config.spanIdField, "SpanId"),
		serviceName: configuredExpression(
			source.config.serviceNameField,
			"ServiceName",
		),
		body: configuredExpression(source.config.bodyField, "Body"),
		severityText: configuredExpression(
			source.config.severityField,
			"SeverityText",
		),
	};
}

type TraceQueryBounds = {
	startIso: string;
	endIso: string;
};

type TraceBoundsRow = {
	start: string | null;
	end: string | null;
};

function timestampRangePredicates(
	timestampExpression: string,
	bounds: TraceQueryBounds | null,
) {
	if (!bounds) return [];
	return [
		`${timestampExpression} >= parseDateTime64BestEffort('${escapeSqlString(bounds.startIso)}', 9)`,
		`${timestampExpression} <= parseDateTime64BestEffort('${escapeSqlString(bounds.endIso)}', 9)`,
	];
}

function traceIdPredicate(traceIdExpression: string, traceId: string) {
	return (
		predicateForExpression(traceIdExpression, traceId, "traceId") ??
		`toString(${traceIdExpression}) = '${escapeSqlString(traceId)}'`
	);
}

function getTraceLookupTableName(source: TraceSourceEntity) {
	if (!source.config.table) {
		throw new Error("Trace source is missing table configuration");
	}
	return `${source.config.table}_trace_id_ts`;
}

export function buildTraceBoundsQuery(
	source: TraceSourceEntity,
	traceId: string,
) {
	if (!source.config.database || !source.config.table) {
		throw new Error("Trace source is missing database or table configuration");
	}

	const fields = getTraceFieldExpressions(source);
	return [
		"SELECT min(Start) AS start, max(End) AS end",
		`FROM ${quoteIdentifier(source.config.database)}.${quoteIdentifier(getTraceLookupTableName(source))}`,
		`WHERE ${traceIdPredicate(fields.traceId, traceId)}`,
	].join("\n");
}

function sourceQueryRangeLimit(source: LogSourceEntity | TraceSourceEntity) {
	const limit = source.config.queryRangeLimit ?? DEFAULT_QUERY_RANGE_LIMIT;
	return {
		lookbackDays: Math.max(0, Math.trunc(limit.lookbackDays)),
		forwardDays: Math.max(0, Math.trunc(limit.forwardDays)),
	};
}

function addDays(date: Date, days: number) {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dateFromTraceBoundsValue(value: unknown) {
	const date = dateFromValue(value);
	return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function resolveTraceWaterfallTimeBounds(
	source: LogSourceEntity,
	referenceTimestamp: unknown,
	lookupBounds?: TraceBoundsRow | null,
): TraceQueryBounds {
	const referenceDate = dateFromValue(referenceTimestamp) ?? new Date();
	const rangeLimit = sourceQueryRangeLimit(source);
	const maxStart = addDays(referenceDate, -rangeLimit.lookbackDays);
	const maxEnd = addDays(referenceDate, rangeLimit.forwardDays);
	const lookupStart = dateFromTraceBoundsValue(lookupBounds?.start);
	const lookupEnd = dateFromTraceBoundsValue(lookupBounds?.end);
	const start =
		lookupStart && lookupStart.getTime() > maxStart.getTime()
			? lookupStart
			: maxStart;
	const end =
		lookupEnd && lookupEnd.getTime() < maxEnd.getTime() ? lookupEnd : maxEnd;

	if (start.getTime() <= end.getTime()) {
		return {
			startIso: start.toISOString(),
			endIso: end.toISOString(),
		};
	}

	return {
		startIso: maxStart.toISOString(),
		endIso: maxEnd.toISOString(),
	};
}

export function buildTraceWaterfallSpansQuery(
	source: TraceSourceEntity,
	traceId: string,
	limit: number,
	bounds: TraceQueryBounds | null = null,
) {
	if (!source.config.database || !source.config.table) {
		throw new Error("Trace source is missing database or table configuration");
	}

	const fields = getTraceFieldExpressions(source);
	const whereClauses = [
		traceIdPredicate(fields.traceId, traceId),
		...timestampRangePredicates(fields.timestamp, bounds),
	];

	return [
		[
			"SELECT *",
			aliasedSelect(fields.timestamp, TRACE_ALIASES.timestamp),
			aliasedSelect(fields.traceId, TRACE_ALIASES.traceId),
			aliasedSelect(fields.spanId, TRACE_ALIASES.spanId),
			aliasedSelect(fields.parentSpanId, TRACE_ALIASES.parentSpanId),
			aliasedSelect(fields.name, TRACE_ALIASES.name),
			aliasedSelect(fields.serviceName, TRACE_ALIASES.serviceName),
			aliasedSelect(fields.duration, TRACE_ALIASES.duration),
			aliasedSelect(fields.statusCode, TRACE_ALIASES.statusCode),
			aliasedSelect(fields.statusMessage, TRACE_ALIASES.statusMessage),
			aliasedSelect(fields.spanKind, TRACE_ALIASES.spanKind),
		].join(", "),
		`FROM ${quoteIdentifier(source.config.database)}.${quoteIdentifier(source.config.table)}`,
		`WHERE ${whereClauses.join(" AND ")}`,
		`ORDER BY ${fields.timestamp} ASC`,
		`LIMIT ${limit}`,
	].join("\n");
}

export function buildTraceWaterfallLogsQuery(
	source: LogSourceEntity,
	traceId: string,
	limit: number,
	bounds: TraceQueryBounds | null = null,
) {
	if (!source.config.database || !source.config.table) {
		throw new Error("Log source is missing database or table configuration");
	}

	const fields = getLogFieldExpressions(source);
	const whereClauses = [
		traceIdPredicate(fields.traceId, traceId),
		...timestampRangePredicates(fields.timestamp, bounds),
	];

	return [
		[
			"SELECT *",
			aliasedSelect(fields.timestamp, TRACE_ALIASES.timestamp),
			aliasedSelect(fields.traceId, TRACE_ALIASES.traceId),
			aliasedSelect(fields.spanId, TRACE_ALIASES.spanId),
			aliasedSelect(fields.serviceName, TRACE_ALIASES.serviceName),
			aliasedSelect(fields.body, TRACE_ALIASES.body),
			aliasedSelect(fields.severityText, TRACE_ALIASES.severityText),
		].join(", "),
		`FROM ${quoteIdentifier(source.config.database)}.${quoteIdentifier(source.config.table)}`,
		`WHERE ${whereClauses.join(" AND ")}`,
		`ORDER BY ${fields.timestamp} ASC`,
		`LIMIT ${limit}`,
	].join("\n");
}

function buildTraceRowDetailQuery(source: TraceSourceEntity, rowWhere: string) {
	if (!source.config.database || !source.config.table) {
		throw new Error("Trace source is missing database or table configuration");
	}

	const fields = getTraceFieldExpressions(source);

	return [
		[
			"SELECT *",
			aliasedSelect(fields.timestamp, TRACE_ALIASES.timestamp),
			aliasedSelect(fields.traceId, TRACE_ALIASES.traceId),
			aliasedSelect(fields.spanId, TRACE_ALIASES.spanId),
			aliasedSelect(fields.parentSpanId, TRACE_ALIASES.parentSpanId),
			aliasedSelect(fields.name, TRACE_ALIASES.name),
			aliasedSelect(fields.serviceName, TRACE_ALIASES.serviceName),
			aliasedSelect(fields.duration, TRACE_ALIASES.duration),
			aliasedSelect(fields.statusCode, TRACE_ALIASES.statusCode),
			aliasedSelect(fields.statusMessage, TRACE_ALIASES.statusMessage),
			aliasedSelect(fields.spanKind, TRACE_ALIASES.spanKind),
		].join(", "),
		`FROM ${quoteIdentifier(source.config.database)}.${quoteIdentifier(source.config.table)}`,
		`WHERE ${rowWhere}`,
		"LIMIT 2",
	].join("\n");
}

function rowWhereFromPredicates(
	predicates: Array<string | null>,
	minimumPredicates: number,
) {
	const usablePredicates = predicates.filter(
		(predicate): predicate is string => predicate != null,
	);
	if (usablePredicates.length < minimumPredicates) return null;
	return usablePredicates.join(" AND ");
}

function buildLogTraceNodeRowWhere(source: LogSourceEntity, row: DataRow) {
	const fields = getLogFieldExpressions(source);

	return rowWhereFromPredicates(
		[
			predicateForExpression(
				fields.traceId,
				fallbackValue(row, FIELD_FALLBACKS.traceId),
				"traceId",
			),
			predicateForExpression(
				fields.spanId,
				fallbackValue(row, FIELD_FALLBACKS.spanId),
				"spanId",
			),
			predicateForExpression(
				fields.timestamp,
				fallbackValue(row, FIELD_FALLBACKS.timestamp),
				"timestamp",
			),
			predicateForExpression(
				fields.serviceName,
				fallbackValue(row, FIELD_FALLBACKS.serviceName),
				"serviceName",
			),
			predicateForExpression(
				fields.body,
				fallbackValue(row, FIELD_FALLBACKS.body),
				"body",
			),
			predicateForExpression(
				fields.severityText,
				fallbackValue(row, FIELD_FALLBACKS.severityText),
				"severityText",
			),
		],
		2,
	);
}

function buildSpanTraceNodeRowWhere(source: TraceSourceEntity, row: DataRow) {
	const fields = getTraceFieldExpressions(source);

	return rowWhereFromPredicates(
		[
			predicateForExpression(
				fields.traceId,
				fallbackValue(row, FIELD_FALLBACKS.traceId),
				"traceId",
			),
			predicateForExpression(
				fields.spanId,
				fallbackValue(row, FIELD_FALLBACKS.spanId),
				"spanId",
			),
			predicateForExpression(
				fields.parentSpanId,
				fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.ParentSpanId),
			),
			predicateForExpression(
				fields.timestamp,
				fallbackValue(row, FIELD_FALLBACKS.timestamp),
				"timestamp",
			),
			predicateForExpression(
				fields.serviceName,
				fallbackValue(row, FIELD_FALLBACKS.serviceName),
				"serviceName",
			),
			predicateForExpression(
				fields.name,
				fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.SpanName),
			),
			predicateForExpression(
				fields.duration,
				fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.Duration),
			),
			predicateForExpression(
				fields.statusCode,
				fallbackValue(row, TOP_LEVEL_FIELD_FALLBACKS.StatusCode),
			),
		],
		2,
	);
}

function identityForTraceNodeSelection(
	targetSource: LogSourceEntity | TraceSourceEntity,
	rowWhere: string,
): RowIdentity {
	return {
		sourceId: targetSource.id,
		connectionId: targetSource.connectionId,
		tableLabel: sourceTableLabel(targetSource),
		rowWhere,
		selectedRowKey: `${targetSource.id}:${rowWhere}`,
		aliasWith: [],
	};
}

export function createLogsRowPanelAdapter(
	source: LogSourceEntity,
	allSources: SourceEntity[] = [source],
): RowPanelAdapter {
	return {
		getQueryKey: (identity) => [
			"logs",
			"row-panel",
			identity.sourceId,
			identity.rowWhere,
		],
		fetchRow: async (identity) => {
			const client = createProxyClient(identity.connectionId);
			const traceSource =
				identity.sourceId === source.id
					? null
					: findTraceSource(allSources, identity.sourceId);
			if (identity.sourceId !== source.id && !traceSource) {
				throw new Error("Selected row source is not available");
			}
			const query = traceSource
				? buildTraceRowDetailQuery(traceSource, identity.rowWhere)
				: buildLogsRowDetailQuery(source, identity.rowWhere);
			const result = await executeClickhouseJsonQuery<DataRow>(client, query);
			return { rows: result.data };
		},
		resolveFields: (row) => resolveLogsRowFields(source, row),
		getTracePanel: (row, fields) => {
			const traceId = meaningfulString(fields.traceId);
			const spanId = meaningfulString(fields.spanId);
			if (!traceId && !spanId) return null;

			const traceSourceId = source.config.traceSourceId;
			if (!traceSourceId) {
				return {
					kind: "setup-required",
					traceId,
					spanId,
					title: "Trace source not configured",
					description: traceSetupDescription(source),
				};
			}

			if (!traceId) {
				return {
					kind: "setup-required",
					spanId,
					title: "Trace ID missing",
					description: missingTraceIdDescription(source),
				};
			}

			const traceSource = findTraceSource(allSources, traceSourceId);
			if (!traceSource) {
				return {
					kind: "setup-required",
					traceId,
					spanId,
					title: "Trace source unavailable",
					description: unavailableTraceSourceDescription(source, traceSourceId),
				};
			}

			return {
				kind: "available",
				traceId,
				spanId,
				traceSourceId: traceSource.id,
				logSourceId: source.id,
				traceSourceName: sourceTableLabel(traceSource),
				logSourceName: sourceTableLabel(source),
				initialHighlightHint: buildTraceInitialHighlightHint(
					source,
					row,
					fields,
				),
			};
		},
		getTraceQueryKey: (_identity, tracePanel) => [
			"logs",
			"trace-waterfall",
			source.id,
			tracePanel.traceSourceId,
			tracePanel.traceId,
			getTraceWaterfallLimit(),
		],
		fetchTrace: async (_identity, tracePanel: RowTracePanelAvailable) => {
			const traceSource = findTraceSource(allSources, tracePanel.traceSourceId);
			if (!traceSource) {
				throw new Error("Correlated trace source is not available");
			}

			const limit = getTraceWaterfallLimit();
			const spansQuery = buildTraceWaterfallSpansQuery(
				traceSource,
				tracePanel.traceId,
				limit,
			);
			const logsQuery = buildTraceWaterfallLogsQuery(
				source,
				tracePanel.traceId,
				limit,
			);
			const [spansResult, logsResult] = await Promise.all([
				executeClickhouseJsonQuery<DataRow>(
					createProxyClient(traceSource.connectionId),
					spansQuery,
				),
				executeClickhouseJsonQuery<DataRow>(
					createProxyClient(source.connectionId),
					logsQuery,
				),
			]);

			return {
				traceId: tracePanel.traceId,
				spans: spansResult.data,
				logs: logsResult.data,
				traceSourceName: sourceTableLabel(traceSource),
				logSourceName: sourceTableLabel(source),
				durationPrecision: traceSource.config.durationPrecisionField ?? 9,
				limit,
				truncated:
					spansResult.data.length >= limit ||
					logsResult.data.length >= limit ||
					Boolean(spansResult.rows_before_limit_at_least) ||
					Boolean(logsResult.rows_before_limit_at_least),
			};
		},
		getTraceNodeRowIdentity: (_identity, tracePanel, selection) => {
			if (selection.kind === "log") {
				const rowWhere = buildLogTraceNodeRowWhere(source, selection.row);
				return rowWhere
					? identityForTraceNodeSelection(source, rowWhere)
					: null;
			}

			const traceSource = findTraceSource(allSources, tracePanel.traceSourceId);
			if (!traceSource) return null;
			const rowWhere = buildSpanTraceNodeRowWhere(traceSource, selection.row);
			return rowWhere
				? identityForTraceNodeSelection(traceSource, rowWhere)
				: null;
		},
		getOverview: (row, fields) => getLogsOverview(source, row, fields),
		getColumnValues: stripTechnicalAliases,
		getColumnValuesLabel: (row) => getLogsColumnValuesLabel(source, row),
		formatError: formatClickhouseQueryError,
	};
}
