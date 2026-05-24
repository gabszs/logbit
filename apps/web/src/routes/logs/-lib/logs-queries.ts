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
	xAxisLabel?: string;
	bucketStart: string;
	bucketEnd: string;
	total: number;
	values: Record<string, number>;
	groups: Array<LogsVolumeGroup & { count: number }>;
};

export type LogsVolumeChartData = {
	points: LogsVolumePoint[];
	groups: LogsVolumeGroup[];
	xAxisTicks: string[];
};

type LogsVolumeRowsOptions = {
	timeBounds?: LogsQueryAbsoluteTimeRange | null;
	formatBucketLabel?: (date: Date, range: LogTimeRange) => string;
};

type LogsVolumeBucketUnit = "SECOND" | "MINUTE" | "HOUR";
type LogsVolumeBucket = {
	amount: number;
	unit: LogsVolumeBucketUnit;
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
	"30m": { amount: 20, unit: "SECOND" },
	"1h": { amount: 30, unit: "SECOND" },
	"6h": { amount: 2, unit: "MINUTE" },
	"12h": { amount: 3, unit: "MINUTE" },
	"1d": { amount: 5, unit: "MINUTE" },
} as const satisfies Record<LogTimeRange, LogsVolumeBucket>;

const LOGS_VOLUME_BUCKET_STEPS = [
	{ amount: 15, unit: "SECOND" },
	{ amount: 20, unit: "SECOND" },
	{ amount: 30, unit: "SECOND" },
	{ amount: 1, unit: "MINUTE" },
	{ amount: 2, unit: "MINUTE" },
	{ amount: 3, unit: "MINUTE" },
	{ amount: 5, unit: "MINUTE" },
	{ amount: 10, unit: "MINUTE" },
	{ amount: 15, unit: "MINUTE" },
	{ amount: 30, unit: "MINUTE" },
	{ amount: 1, unit: "HOUR" },
	{ amount: 2, unit: "HOUR" },
	{ amount: 3, unit: "HOUR" },
	{ amount: 6, unit: "HOUR" },
	{ amount: 12, unit: "HOUR" },
	{ amount: 24, unit: "HOUR" },
] as const satisfies readonly LogsVolumeBucket[];
const LOGS_VOLUME_MAX_BUCKETS = Math.ceil(
	RANGE_WINDOW_MS["1d"] / getBucketDurationMs(RANGE_BUCKET["1d"]),
);

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

export function resolveLogsQueryTimeBounds(
	range: LogTimeRange,
	options: {
		now?: Date;
		absoluteTimeRange?: LogsQueryAbsoluteTimeRange;
	} = {},
): LogsQueryAbsoluteTimeRange {
	const { start, end } = resolveTimeBounds(
		range,
		options.now,
		options.absoluteTimeRange,
	);

	return {
		startIso: start,
		endIso: end,
	};
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

function getBucketDurationMs(bucket: LogsVolumeBucket) {
	if (bucket.unit === "SECOND") {
		return bucket.amount * 1000;
	}
	if (bucket.unit === "MINUTE") {
		return bucket.amount * 60 * 1000;
	}
	return bucket.amount * 60 * 60 * 1000;
}

function getTimeBoundsDurationMs(
	timeBounds: LogsQueryAbsoluteTimeRange | null | undefined,
) {
	if (!timeBounds) return null;

	const start = new Date(timeBounds.startIso);
	const end = new Date(timeBounds.endIso);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return null;
	}

	const durationMs = end.getTime() - start.getTime();
	return durationMs > 0 ? durationMs : null;
}

function getTimeBucket(
	range: LogTimeRange,
	timeBounds?: LogsQueryAbsoluteTimeRange | null,
) {
	const preferredBucket = RANGE_BUCKET[range];
	const durationMs =
		getTimeBoundsDurationMs(timeBounds) ?? RANGE_WINDOW_MS[range];
	const minimumBucketMs = Math.ceil(durationMs / LOGS_VOLUME_MAX_BUCKETS);

	if (getBucketDurationMs(preferredBucket) >= minimumBucketMs) {
		return preferredBucket;
	}

	return (
		LOGS_VOLUME_BUCKET_STEPS.find(
			(bucket) => getBucketDurationMs(bucket) >= minimumBucketMs,
		) ?? LOGS_VOLUME_BUCKET_STEPS[LOGS_VOLUME_BUCKET_STEPS.length - 1]
	);
}

function addBucketDuration(date: Date, bucket: LogsVolumeBucket) {
	const nextDate = new Date(date);
	nextDate.setTime(nextDate.getTime() + getBucketDurationMs(bucket));
	return nextDate;
}

function getBucketStart(date: Date, bucket: LogsVolumeBucket) {
	const { amount, unit } = bucket;
	const bucketDate = new Date(date);
	bucketDate.setUTCMilliseconds(0);

	if (unit === "SECOND") {
		const seconds = Math.floor(bucketDate.getUTCSeconds() / amount) * amount;
		bucketDate.setUTCSeconds(seconds, 0);
		return bucketDate;
	}

	const minutes = Math.floor(bucketDate.getUTCMinutes() / amount) * amount;
	if (unit === "MINUTE") {
		bucketDate.setUTCMinutes(minutes, 0, 0);
		return bucketDate;
	}

	const hours = Math.floor(bucketDate.getUTCHours() / amount) * amount;
	bucketDate.setUTCHours(hours, 0, 0, 0);
	return bucketDate;
}

function parseClickHouseBucketDate(value: string) {
	const normalizedValue = value.trim();
	const hasExplicitTimezone =
		/[zZ]$/u.test(normalizedValue) ||
		/[+-]\d{2}:?\d{2}$/u.test(normalizedValue);
	const dateTimeWithoutTimezone =
		/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/u.exec(
			normalizedValue,
		);

	if (dateTimeWithoutTimezone && !hasExplicitTimezone) {
		return new Date(
			`${dateTimeWithoutTimezone[1]}T${dateTimeWithoutTimezone[2]}Z`,
		);
	}

	return new Date(normalizedValue);
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
	const severityGroupOrder: readonly string[] = SEVERITY_GROUP_ORDER;
	const aIndex = severityGroupOrder.indexOf(a);
	const bIndex = severityGroupOrder.indexOf(b);

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

	const { timestampQueryField, start, end, clauses } = buildLogsQueryConfig(
		source,
		options,
	);
	const { amount, unit } = getTimeBucket(options.timeRange, {
		startIso: start,
		endIso: end,
	});
	const severityGroupExpression = buildSeverityGroupExpression(source);
	const bucketExpression = `toStartOfInterval(${timestampQueryField}, INTERVAL ${amount} ${unit})`;
	const selectClauses = [
		`formatDateTime(${bucketExpression}, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS bucket`,
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
	options: LogsVolumeRowsOptions = {},
): LogsVolumeChartData {
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
	const formatPointLabel = options.formatBucketLabel ?? formatBucketLabel;
	const timeBounds = options.timeBounds;
	const boundsStart = timeBounds ? new Date(timeBounds.startIso) : null;
	const boundsEnd = timeBounds ? new Date(timeBounds.endIso) : null;
	const volumeBucket = getTimeBucket(timeRange, timeBounds);

	// Bucket keys stay in UTC ISO; route-level formatters render local labels.
	if (
		boundsStart &&
		boundsEnd &&
		!Number.isNaN(boundsStart.getTime()) &&
		!Number.isNaN(boundsEnd.getTime()) &&
		boundsStart < boundsEnd
	) {
		let bucketDate = getBucketStart(boundsStart, volumeBucket);
		while (bucketDate < boundsEnd) {
			const bucketStart = bucketDate.toISOString();
			bucketMap.set(bucketStart, {
				bucketStart,
				bucketEnd: addBucketDuration(bucketDate, volumeBucket).toISOString(),
				bucketLabel: formatPointLabel(bucketDate, timeRange),
				values: {},
			});
			bucketDate = addBucketDuration(bucketDate, volumeBucket);
		}
	}

	for (const row of rows) {
		const bucketDate = parseClickHouseBucketDate(row.bucket);
		if (Number.isNaN(bucketDate.getTime())) {
			continue;
		}
		const rowCount = Number(row.rows);
		if (!Number.isFinite(rowCount)) {
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

		const bucketStartDate = getBucketStart(bucketDate, volumeBucket);
		const bucketStart = bucketStartDate.toISOString();
		const bucketEnd = addBucketDuration(
			bucketStartDate,
			volumeBucket,
		).toISOString();
		const currentBucket = bucketMap.get(bucketStart) ?? {
			bucketStart,
			bucketEnd,
			bucketLabel: formatPointLabel(bucketStartDate, timeRange),
			values: {},
		};
		currentBucket.values[groupKey] =
			(currentBucket.values[groupKey] ?? 0) + rowCount;
		bucketMap.set(bucketStart, currentBucket);
	}

	const groups = Array.from(groupDefinitions.values()).sort((a, b) =>
		sortGroupKeys(a.key, b.key),
	);

	const points: LogsVolumePoint[] =
		groups.length === 0
			? []
			: Array.from(bucketMap.values())
					.sort(
						(a, b) =>
							new Date(a.bucketStart).getTime() -
							new Date(b.bucketStart).getTime(),
					)
					.map((bucket) => {
						const pointGroups = groups
							.map((group) => ({
								...group,
								count: bucket.values[group.key] ?? 0,
							}))
							.filter((group) => group.count > 0);

						const total = pointGroups.reduce(
							(sum, group) => sum + group.count,
							0,
						);

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
		xAxisTicks: [],
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
