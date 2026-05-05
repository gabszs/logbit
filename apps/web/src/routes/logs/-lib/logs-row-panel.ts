import type {
	DataRow,
	ResolvedRowFields,
	RowIdentity,
	RowPanelAdapter,
	RowPanelAttribute,
	RowPanelOverview,
} from "@/web/components/data-row-side-panel";
import {
	isDataRecord,
	tryParseJsonString,
} from "@/web/components/data-row-side-panel/value-formatting";
import {
	createProxyClient,
	executeClickhouseJsonQuery,
	formatClickhouseQueryError,
} from "@/web/lib/clickhouse-client";
import type { LogSourceEntity } from "@/web/lib/sources";
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
};

const LOG_SELECTOR_CONFIGS: Array<{
	role: LogsSelectorRole;
	configKey:
		| "timestampField"
		| "bodyField"
		| "severityField"
		| "serviceNameField"
		| "traceIdField"
		| "spanIdField"
		| "resourceAttributesField"
		| "logAttributesField";
	fallbackExpression: string;
	includeInRowWhere: boolean;
}> = [
	{
		role: "timestamp",
		configKey: "timestampField",
		fallbackExpression: "Timestamp",
		includeInRowWhere: true,
	},
	{
		role: "body",
		configKey: "bodyField",
		fallbackExpression: "Body",
		includeInRowWhere: true,
	},
	{
		role: "severityText",
		configKey: "severityField",
		fallbackExpression: "SeverityText",
		includeInRowWhere: true,
	},
	{
		role: "serviceName",
		configKey: "serviceNameField",
		fallbackExpression: "ServiceName",
		includeInRowWhere: true,
	},
	{
		role: "traceId",
		configKey: "traceIdField",
		fallbackExpression: "TraceId",
		includeInRowWhere: true,
	},
	{
		role: "spanId",
		configKey: "spanIdField",
		fallbackExpression: "SpanId",
		includeInRowWhere: true,
	},
	{
		role: "resourceAttributes",
		configKey: "resourceAttributesField",
		fallbackExpression: "ResourceAttributes",
		includeInRowWhere: false,
	},
	{
		role: "logAttributes",
		configKey: "logAttributesField",
		fallbackExpression: "LogAttributes",
		includeInRowWhere: false,
	},
];

const FIELD_FALLBACKS = {
	timestamp: ["Timestamp", "timestamp", "time", "Time", "ts"],
	traceId: ["TraceId", "traceId", "trace_id"],
	spanId: ["SpanId", "spanId", "span_id"],
	serviceName: ["ServiceName", "serviceName", "service_name", "service"],
	severityText: ["SeverityText", "severityText", "severity", "level", "Level"],
	severityNumber: ["SeverityNumber", "severityNumber", "severity_number"],
	body: ["Body", "body", "message", "Message", "msg"],
	resourceAttributes: [
		"ResourceAttributes",
		"resourceAttributes",
		"resource_attributes",
	],
	logAttributes: ["LogAttributes", "logAttributes", "log_attributes"],
	spanAttributes: ["SpanAttributes", "spanAttributes", "span_attributes"],
} as const;

const TOP_LEVEL_FIELD_FALLBACKS = {
	SpanName: ["SpanName", "spanName", "span_name"],
	Duration: ["Duration", "duration", "DurationNano", "durationNano"],
	StatusCode: ["StatusCode", "statusCode", "status_code"],
	StatusMessage: ["StatusMessage", "statusMessage", "status_message"],
	SpanKind: ["SpanKind", "spanKind", "span_kind"],
	ParentSpanId: ["ParentSpanId", "parentSpanId", "parent_span_id"],
	ScopeName: ["ScopeName", "scopeName", "scope_name"],
	ScopeVersion: ["ScopeVersion", "scopeVersion", "scope_version"],
} as const;

const SPAN_ROW_FIELD_HINTS = [
	"SpanName",
	"spanName",
	"span_name",
	"SpanKind",
	"spanKind",
	"span_kind",
	"ParentSpanId",
	"parentSpanId",
	"parent_span_id",
	"Duration",
	"duration",
	"DurationNano",
	"durationNano",
	"StatusCode",
	"statusCode",
	"StatusMessage",
	"statusMessage",
] as const;

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
		};
	}).filter((selector) => selector.expression.trim().length > 0);
}

export function getLogsRowSelectorAliases(source: LogSourceEntity) {
	return getLogsRowSelectors(source).map((selector) => selector.alias);
}

export function getLogsRowSelectorSelects(source: LogSourceEntity) {
	return getLogsRowSelectors(source).map((selector) => ({
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

function predicateForSelector(selector: LogsRowSelector, value: unknown) {
	if (!isScalarPredicateValue(value)) return null;
	if (value == null) return `isNull(${selector.expression})`;
	return `toString(${selector.expression}) = '${escapeSqlString(String(value))}'`;
}

function stripTechnicalAliases(row: DataRow): DataRow {
	return Object.fromEntries(
		Object.entries(row).filter(
			([key]) => !key.startsWith(LOGLOG_ROW_SELECTOR_PREFIX),
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
		severityText: valueForRole(
			source,
			row,
			"severityText",
			FIELD_FALLBACKS.severityText,
		),
		severityNumber: fallbackValue(row, FIELD_FALLBACKS.severityNumber),
		body: valueForRole(source, row, "body", FIELD_FALLBACKS.body),
	};
}

export function createLogsRowPanelAdapter(
	source: LogSourceEntity,
): RowPanelAdapter {
	return {
		getQueryKey: (identity) => [
			"logs",
			"row-panel",
			source.id,
			identity.rowWhere,
		],
		fetchRow: async (identity) => {
			const client = createProxyClient(identity.connectionId);
			const query = buildLogsRowDetailQuery(source, identity.rowWhere);
			const result = await executeClickhouseJsonQuery<DataRow>(client, query);
			return { rows: result.data };
		},
		resolveFields: (row) => resolveLogsRowFields(source, row),
		getOverview: (row, fields) => getLogsOverview(source, row, fields),
		getColumnValues: stripTechnicalAliases,
		getColumnValuesLabel: (row) => getLogsColumnValuesLabel(source, row),
		formatError: formatClickhouseQueryError,
	};
}
