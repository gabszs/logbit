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

export type LogsQueryAbsoluteTimeRange = {
	startIso: string;
	endIso: string;
};

export type LogsChartDrilldown = {
	bucketStart: string;
	bucketEnd: string;
	groupValue: string | null;
	label: string;
};

export type LogsVolumeRow = {
	bucket: string;
	rows: number | string;
	group_value?: string | null;
};

export type LogsVolumeGroup = {
	key: string;
	label: string;
	canFilter: boolean;
};

export type LogsVolumePoint = {
	bucketLabel: string;
	bucketStart: string;
	bucketEnd: string;
	total: number;
	values: Record<string, number>;
	groups: Array<LogsVolumeGroup & { count: number }>;
};

const DEFAULT_SELECT_QUERY =
	"Timestamp, ServiceName as service, SeverityText as level, Body";
const DEFAULT_ORDER_BY_QUERY = "Timestamp DESC";
const UNKNOWN_GROUP_KEY = "unknown";
const ALL_LOGS_GROUP_KEY = "__all__";
const ALL_LOGS_GROUP_LABEL = "All logs";
const SEVERITY_GROUP_ORDER = [
	"FATAL",
	"CRITICAL",
	"ERROR",
	"WARN",
	"INFO",
	"DEBUG",
	"TRACE",
	UNKNOWN_GROUP_KEY,
] as const;
const SEVERITY_GROUP_SET = new Set<string>(SEVERITY_GROUP_ORDER);

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

type LogsQueryBaseOptions = {
	whereQuery?: string;
	timeRange: LogTimeRange;
	now?: Date;
	absoluteTimeRange?: LogsQueryAbsoluteTimeRange;
	additionalWhereClauses?: string[];
};

export function quoteIdentifier(identifier: string) {
	return `\`${identifier.replaceAll("`", "``")}\``;
}

export function escapeSqlString(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function normalizeSqlExpression(value: string | null | undefined) {
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

function resolveTimeBounds(
	range: LogTimeRange,
	now: Date | undefined,
	absoluteTimeRange?: LogsQueryAbsoluteTimeRange,
) {
	if (absoluteTimeRange) {
		return {
			start: absoluteTimeRange.startIso,
			end: absoluteTimeRange.endIso,
		};
	}

	return buildTimeBounds(range, now);
}

function buildTimePredicate(
	timestampQueryField: string,
	startIso: string,
	endIso: string,
) {
	const timestamp = normalizeSqlExpression(timestampQueryField) || "Timestamp";
	return [
		`${timestamp} >= parseDateTimeBestEffortOrNull('${startIso}')`,
		`${timestamp} < parseDateTimeBestEffortOrNull('${endIso}')`,
	];
}

function buildWhereClauses(
	timestampQueryField: string,
	startIso: string,
	endIso: string,
	whereClause?: string,
	additionalWhereClauses: string[] = [],
) {
	const clauses = buildTimePredicate(timestampQueryField, startIso, endIso);
	const normalizedWhere = normalizeSqlExpression(whereClause);
	if (normalizedWhere) {
		clauses.push(`(${normalizedWhere})`);
	}
	for (const clause of additionalWhereClauses) {
		const normalizedClause = normalizeSqlExpression(clause);
		if (normalizedClause) {
			clauses.push(`(${normalizedClause})`);
		}
	}
	return clauses;
}

function buildFromClause(source: LogSourceEntity) {
	return `FROM ${quoteIdentifier(source.config.database ?? "")}.${quoteIdentifier(source.config.table ?? "")}`;
}

function getTimeBucket(range: LogTimeRange) {
	return RANGE_BUCKET[range];
}

function addBucketDuration(date: Date, range: LogTimeRange) {
	const { amount, unit } = getTimeBucket(range);
	const nextDate = new Date(date);
	if (unit === "SECOND") {
		nextDate.setUTCSeconds(nextDate.getUTCSeconds() + amount);
		return nextDate;
	}

	nextDate.setUTCMinutes(nextDate.getUTCMinutes() + amount);
	return nextDate;
}

function formatBucketLabel(date: Date, range: LogTimeRange) {
	const { unit } = getTimeBucket(range);
	const options: Intl.DateTimeFormatOptions =
		range === "1d"
			? {
					month: "short",
					day: "numeric",
					hour: "numeric",
					minute: "2-digit",
				}
			: {
					hour: "numeric",
					minute: "2-digit",
					...(unit === "SECOND" ? { second: "2-digit" } : {}),
				};

	return new Intl.DateTimeFormat(undefined, options).format(date);
}

function sortGroupKeys(a: string, b: string) {
	const aIndex = SEVERITY_GROUP_ORDER.findIndex((group) => group === a);
	const bIndex = SEVERITY_GROUP_ORDER.findIndex((group) => group === b);

	if (aIndex !== -1 || bIndex !== -1) {
		if (aIndex === -1) return 1;
		if (bIndex === -1) return -1;
		return aIndex - bIndex;
	}

	return a.localeCompare(b);
}

function normalizeSeverityGroupValue(value: string | null | undefined) {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) return UNKNOWN_GROUP_KEY;

	const upperValue = trimmed.toUpperCase();
	if (upperValue === "UNKNOWN") {
		return UNKNOWN_GROUP_KEY;
	}
	if (upperValue === "WARNING") {
		return "WARN";
	}
	if (SEVERITY_GROUP_SET.has(upperValue)) {
		return upperValue;
	}

	return trimmed;
}

function buildSeverityGroupExpression(source: LogSourceEntity) {
	const severityField = normalizeSqlExpression(source.config.severityField);
	if (!severityField) return null;

	const fieldExpression = quoteIdentifier(severityField);
	const textExpression = `toString(${fieldExpression})`;
	const normalizedExpression = `upper(${textExpression})`;
	return `multiIf(nullIf(${textExpression}, '') IS NULL, '${UNKNOWN_GROUP_KEY}', ${normalizedExpression} = 'WARNING', 'WARN', ${normalizedExpression})`;
}

function buildLogsQueryConfig(
	source: LogSourceEntity,
	options: LogsQueryBaseOptions,
) {
	const timestampQueryField =
		normalizeSqlExpression(source.config.timestampQueryField) || "Timestamp";
	const { start, end } = resolveTimeBounds(
		options.timeRange,
		options.now,
		options.absoluteTimeRange,
	);
	const clauses = buildWhereClauses(
		timestampQueryField,
		start,
		end,
		options.whereQuery,
		options.additionalWhereClauses,
	);

	return {
		timestampQueryField,
		start,
		end,
		clauses,
	};
}

export function buildLogsTableQuery(
	source: LogSourceEntity,
	options: LogsQueryBaseOptions & {
		selectQuery: string;
		orderByQuery: string;
		extraSelectExpressions?: Array<{
			valueExpression: string;
			alias: string;
		}>;
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

	const { clauses } = buildLogsQueryConfig(source, options);
	const extraSelects =
		options.extraSelectExpressions
			?.map((expression) => {
				const valueExpression = normalizeSqlExpression(
					expression.valueExpression,
				);
				if (!valueExpression || !expression.alias.trim()) return null;
				return `${valueExpression} AS ${quoteIdentifier(expression.alias)}`;
			})
			.filter((expression): expression is string => expression != null) ?? [];

	return [
		`SELECT ${[selectQuery, ...extraSelects].join(", ")}`,
		buildFromClause(source),
		`WHERE ${clauses.join(" AND ")}`,
		`ORDER BY ${orderByQuery}`,
		"LIMIT 500",
	].join("\n");
}

export function buildLogsVolumeQuery(
	source: LogSourceEntity,
	options: LogsQueryBaseOptions = {
		timeRange: "15m",
	},
) {
	if (!isConfiguredLogSource(source)) return null;

	const { amount, unit } = RANGE_BUCKET[options.timeRange];
	const { timestampQueryField, clauses } = buildLogsQueryConfig(
		source,
		options,
	);
	const severityGroupExpression = buildSeverityGroupExpression(source);
	const selectClauses = [
		`toStartOfInterval(${timestampQueryField}, INTERVAL ${amount} ${unit}) AS bucket`,
	];
	const groupByClauses = ["bucket"];

	if (severityGroupExpression) {
		selectClauses.push(`${severityGroupExpression} AS group_value`);
		groupByClauses.push("group_value");
	}
	selectClauses.push("count() AS rows");

	return [
		`SELECT ${selectClauses.join(", ")}`,
		buildFromClause(source),
		`WHERE ${clauses.join(" AND ")}`,
		`GROUP BY ${groupByClauses.join(", ")}`,
		"ORDER BY bucket ASC, rows DESC",
	].join("\n");
}

export function buildLogsChartDrilldownClauses(
	source: LogSourceEntity,
	drilldown: LogsChartDrilldown | null,
) {
	if (!drilldown) return [];

	const severityGroupExpression = buildSeverityGroupExpression(source);
	if (!severityGroupExpression || drilldown.groupValue == null) {
		return [];
	}

	const groupValue = normalizeSeverityGroupValue(drilldown.groupValue);
	return [`${severityGroupExpression} = '${escapeSqlString(groupValue)}'`];
}

export function normalizeLogsVolumeRows(
	rows: LogsVolumeRow[],
	timeRange: LogTimeRange,
	hasSeverityField: boolean,
) {
	const groupDefinitions = new Map<string, LogsVolumeGroup>();
	const bucketMap = new Map<
		string,
		{
			bucketStart: string;
			bucketEnd: string;
			bucketLabel: string;
			values: Record<string, number>;
		}
	>();

	for (const row of rows) {
		const bucketDate = new Date(row.bucket);
		if (Number.isNaN(bucketDate.getTime())) {
			continue;
		}

		const groupKey = hasSeverityField
			? normalizeSeverityGroupValue(row.group_value)
			: ALL_LOGS_GROUP_KEY;
		const groupDefinition: LogsVolumeGroup = hasSeverityField
			? {
					key: groupKey,
					label: groupKey,
					canFilter: true,
				}
			: {
					key: ALL_LOGS_GROUP_KEY,
					label: ALL_LOGS_GROUP_LABEL,
					canFilter: false,
				};
		groupDefinitions.set(groupKey, groupDefinition);

		const bucketStart = bucketDate.toISOString();
		const bucketEnd = addBucketDuration(bucketDate, timeRange).toISOString();
		const currentBucket = bucketMap.get(bucketStart) ?? {
			bucketStart,
			bucketEnd,
			bucketLabel: formatBucketLabel(bucketDate, timeRange),
			values: {},
		};
		currentBucket.values[groupKey] =
			(currentBucket.values[groupKey] ?? 0) + Number(row.rows);
		bucketMap.set(bucketStart, currentBucket);
	}

	const groups = Array.from(groupDefinitions.values()).sort((a, b) =>
		sortGroupKeys(a.key, b.key),
	);

	const points: LogsVolumePoint[] = Array.from(bucketMap.values())
		.sort(
			(a, b) =>
				new Date(a.bucketStart).getTime() - new Date(b.bucketStart).getTime(),
		)
		.map((bucket) => {
			const pointGroups = groups
				.map((group) => ({
					...group,
					count: bucket.values[group.key] ?? 0,
				}))
				.filter((group) => group.count > 0);

			const total = pointGroups.reduce((sum, group) => sum + group.count, 0);

			return {
				bucketLabel: bucket.bucketLabel,
				bucketStart: bucket.bucketStart,
				bucketEnd: bucket.bucketEnd,
				total,
				values: bucket.values,
				groups: pointGroups,
			};
		});

	return {
		points,
		groups,
	};
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
