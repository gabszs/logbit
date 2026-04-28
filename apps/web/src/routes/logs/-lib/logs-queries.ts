import type { LogSourceEntity } from "@/web/lib/sources";

const TIME_RANGE_OPTIONS = [
	{ value: "5m", label: "Last 5 minutes" },
	{ value: "10m", label: "Last 10 minutes" },
	{ value: "15m", label: "Last 15 minutes" },
	{ value: "30m", label: "Last 30 minutes" },
	{ value: "1h", label: "Last 1 hour" },
	{ value: "6h", label: "Last 6 hours" },
	{ value: "12h", label: "Last 12 hours" },
	{ value: "1d", label: "Last 1 day" },
] as const;

export type LogTimeRange = (typeof TIME_RANGE_OPTIONS)[number]["value"];

export const LOG_TIME_RANGE_OPTIONS = TIME_RANGE_OPTIONS;

const DEFAULT_SELECT_QUERY =
	"Timestamp, ServiceName as service, SeverityText as level, Body";
const DEFAULT_ORDER_BY_QUERY = "Timestamp DESC";

const RANGE_WINDOW_MS: Record<LogTimeRange, number> = {
	"5m": 5 * 60 * 1000,
	"10m": 10 * 60 * 1000,
	"15m": 15 * 60 * 1000,
	"30m": 30 * 60 * 1000,
	"1h": 60 * 60 * 1000,
	"6h": 6 * 60 * 60 * 1000,
	"12h": 12 * 60 * 60 * 1000,
	"1d": 24 * 60 * 60 * 1000,
};

const RANGE_BUCKET = {
	"5m": { amount: 15, unit: "SECOND" },
	"10m": { amount: 15, unit: "SECOND" },
	"15m": { amount: 15, unit: "SECOND" },
	"30m": { amount: 1, unit: "MINUTE" },
	"1h": { amount: 1, unit: "MINUTE" },
	"6h": { amount: 10, unit: "MINUTE" },
	"12h": { amount: 10, unit: "MINUTE" },
	"1d": { amount: 30, unit: "MINUTE" },
} as const satisfies Record<
	LogTimeRange,
	{ amount: number; unit: "SECOND" | "MINUTE" }
>;

function quoteIdentifier(identifier: string) {
	return `\`${identifier.replaceAll("`", "``")}\``;
}

function normalizeSqlExpression(value: string | null | undefined) {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) return "";
	return trimmed.replaceAll(/;+\s*$/gu, "");
}

function isConfiguredLogSource(source: LogSourceEntity) {
	return Boolean(source.config.database && source.config.table);
}

function buildTimeBounds(range: LogTimeRange, now = new Date()) {
	const end = now;
	const start = new Date(end.getTime() - RANGE_WINDOW_MS[range]);
	return {
		start: start.toISOString(),
		end: end.toISOString(),
	};
}

function buildTimePredicate(
	timestampField: string,
	startIso: string,
	endIso: string,
) {
	const timestamp = quoteIdentifier(normalizeSqlExpression(timestampField));
	return [
		`${timestamp} >= parseDateTimeBestEffortOrNull('${startIso}')`,
		`${timestamp} < parseDateTimeBestEffortOrNull('${endIso}')`,
	];
}

function buildWhereClauses(
	timestampField: string,
	startIso: string,
	endIso: string,
	whereClause?: string,
) {
	const clauses = buildTimePredicate(timestampField, startIso, endIso);
	const normalizedWhere = normalizeSqlExpression(whereClause);
	if (normalizedWhere) {
		clauses.push(`(${normalizedWhere})`);
	}
	return clauses;
}

function buildFromClause(source: LogSourceEntity) {
	return `FROM ${quoteIdentifier(source.config.database ?? "")}.${quoteIdentifier(source.config.table ?? "")}`;
}

export function buildLogsTableQuery(
	source: LogSourceEntity,
	options: {
		selectQuery: string;
		whereQuery?: string;
		orderByQuery: string;
		timeRange: LogTimeRange;
		now?: Date;
	} = {
		selectQuery: DEFAULT_SELECT_QUERY,
		orderByQuery: DEFAULT_ORDER_BY_QUERY,
		timeRange: "15m",
	},
) {
	if (!isConfiguredLogSource(source)) return null;

	const selectQuery = normalizeSqlExpression(options.selectQuery);
	const orderByQuery = normalizeSqlExpression(options.orderByQuery);
	if (!selectQuery || !orderByQuery) return null;

	const { start, end } = buildTimeBounds(options.timeRange, options.now);
	const clauses = buildWhereClauses(
		source.config.timestampField ?? "Timestamp",
		start,
		end,
		options.whereQuery,
	);

	return [
		`SELECT ${selectQuery}`,
		buildFromClause(source),
		`WHERE ${clauses.join(" AND ")}`,
		`ORDER BY ${orderByQuery}`,
		"LIMIT 500",
	].join("\n");
}

export function buildLogsVolumeQuery(
	source: LogSourceEntity,
	options: {
		whereQuery?: string;
		timeRange: LogTimeRange;
		now?: Date;
	} = {
		timeRange: "15m",
	},
) {
	if (!isConfiguredLogSource(source)) return null;

	const { amount, unit } = RANGE_BUCKET[options.timeRange];
	const { start, end } = buildTimeBounds(options.timeRange, options.now);
	const clauses = buildWhereClauses(
		source.config.timestampField ?? "Timestamp",
		start,
		end,
		options.whereQuery,
	);
	const timestampField = quoteIdentifier(
		normalizeSqlExpression(source.config.timestampField),
	);

	return [
		`SELECT toStartOfInterval(${timestampField}, INTERVAL ${amount} ${unit}) AS bucket, count() AS rows`,
		buildFromClause(source),
		`WHERE ${clauses.join(" AND ")}`,
		"GROUP BY bucket",
		"ORDER BY bucket ASC",
	].join("\n");
}

export function getLogsQueryDefaults(source: LogSourceEntity) {
	return {
		selectQuery:
			normalizeSqlExpression(source.config.defaultSelectQuery) ||
			DEFAULT_SELECT_QUERY,
		orderByQuery:
			normalizeSqlExpression(source.config.defaultOrderByQuery) ||
			DEFAULT_ORDER_BY_QUERY,
	};
}

export function getLogsSourceLabel(source: LogSourceEntity) {
	return `${source.name} · ${source.config.database ?? "?"}.${source.config.table ?? "?"}`;
}
