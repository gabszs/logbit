import type { LogSourceEntity } from "@/web/lib/sources";
import type { ClickhouseRow } from "../-components/dynamic-results-table";
import type { LogTimeRange } from "./logs-queries";

export type LogsResultsView = "table" | "groups";

export type LogsPatternTrendPoint = {
	bucketStart: string;
	count: number;
};

export type LogsPatternGroup = {
	id: string;
	pattern: string;
	count: number;
	countLabel: string;
	level: string | null;
	samples: ClickhouseRow[];
	trend: LogsPatternTrendPoint[];
	latestTimestamp: string | null;
};

export type LogsPatternComputationResult = {
	groups: LogsPatternGroup[];
	bodyKey: string | null;
	timestampKey: string | null;
	levelKey: string | null;
	serviceKey: string | null;
	missingRequiredFields: Array<"body" | "timestamp">;
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

const SEVERITY_ORDER = [
	"FATAL",
	"ERROR",
	"WARN",
	"WARNING",
	"INFO",
	"DEBUG",
	"TRACE",
	"unknown",
] as const;

const FIELD_FALLBACKS = {
	body: ["Body", "body", "message", "Message", "msg", "pattern"],
	level: ["level", "Level", "severity", "SeverityText", "severityText"],
	timestamp: ["Timestamp", "timestamp", "time", "Time", "ts"],
	service: ["service", "ServiceName", "serviceName", "service_name"],
} as const;

function normalizeWhitespace(value: string) {
	return value.replaceAll(/\s+/gu, " ").trim();
}

function stripAnsi(value: string) {
	return value.replaceAll(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping
		/[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/gu,
		"",
	);
}

function replaceDynamicTokens(value: string) {
	return value
		.replaceAll(/\bhttps?:\/\/\S+\b/giu, "<*>")
		.replaceAll(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/giu, "<*>")
		.replaceAll(
			/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
			"<*>",
		)
		.replaceAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, "<*>")
		.replaceAll(
			/\b\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2})?\b/giu,
			"<*>",
		)
		.replaceAll(/\b[0-9a-f]{16,}\b/giu, "<*>")
		.replaceAll(/\b\d+(?:\.\d+)?(?:ms|s|m|h|%)\b/giu, "<*>")
		.replaceAll(/\b\d{6,}\b/gu, "<*>")
		.replaceAll(/\b\d+\b/gu, "<*>");
}

function normalizeJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(normalizeJsonValue);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]) => [
				key,
				normalizeJsonValue(nestedValue),
			]),
		);
	}

	if (typeof value === "string") {
		return normalizeWhitespace(replaceDynamicTokens(stripAnsi(value)));
	}

	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		value == null
	) {
		return "<*>";
	}

	return String(value);
}

function normalizePatternText(rawValue: unknown) {
	const value =
		typeof rawValue === "string"
			? rawValue
			: rawValue == null
				? ""
				: JSON.stringify(rawValue);

	const trimmed = normalizeWhitespace(stripAnsi(value));
	if (!trimmed) return "";

	if (
		(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
		(trimmed.startsWith("[") && trimmed.endsWith("]"))
	) {
		try {
			return JSON.stringify(normalizeJsonValue(JSON.parse(trimmed)));
		} catch {
			// Fall through to plain-text masking when input is only JSON-like.
		}
	}

	return normalizeWhitespace(replaceDynamicTokens(trimmed));
}

function findKeyCaseInsensitive(
	keys: string[],
	expected: string | null | undefined,
) {
	const normalizedExpected = expected?.trim().toLowerCase();
	if (!normalizedExpected) return null;

	return (
		keys.find((key) => key.toLowerCase() === normalizedExpected) ??
		keys.find((key) => key.toLowerCase().includes(normalizedExpected)) ??
		null
	);
}

function findFallbackKey(keys: string[], candidates: readonly string[]) {
	return (
		candidates
			.map((candidate) => findKeyCaseInsensitive(keys, candidate))
			.find(Boolean) ?? null
	);
}

function findTimestampFallbackKey(keys: string[]) {
	return (
		findFallbackKey(keys, FIELD_FALLBACKS.timestamp) ??
		keys.find((key) => {
			const normalizedKey = key.toLowerCase();
			return (
				normalizedKey.includes("timestamp") || normalizedKey.includes("time")
			);
		}) ??
		null
	);
}

function resolveFieldKeys(
	rows: ClickhouseRow[],
	source: LogSourceEntity | null,
) {
	const firstRow = rows[0];
	const keys = firstRow ? Object.keys(firstRow) : [];

	return {
		bodyKey:
			findKeyCaseInsensitive(keys, source?.config.bodyField) ??
			findFallbackKey(keys, FIELD_FALLBACKS.body),
		levelKey:
			findKeyCaseInsensitive(keys, source?.config.severityField) ??
			findFallbackKey(keys, FIELD_FALLBACKS.level),
		timestampKey:
			findKeyCaseInsensitive(keys, source?.config.timestampQueryExpression) ??
			findTimestampFallbackKey(keys),
		serviceKey:
			findKeyCaseInsensitive(keys, source?.config.serviceNameField) ??
			findFallbackKey(keys, FIELD_FALLBACKS.service),
	};
}

function parseTimestamp(value: unknown) {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}

	const timestamp = new Date(value);
	return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function normalizeLevel(value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const upperValue = trimmed.toUpperCase();
	return upperValue === "WARNING" ? "WARN" : upperValue;
}

function getSeverityRank(level: string | null) {
	if (!level) return Number.POSITIVE_INFINITY;
	const index = SEVERITY_ORDER.findIndex((entry) => entry === level);
	return index === -1 ? SEVERITY_ORDER.length : index;
}

function getBucketStart(timestamp: Date, timeRange: LogTimeRange) {
	const { amount, unit } = RANGE_BUCKET[timeRange];
	const bucketStart = new Date(timestamp);

	bucketStart.setUTCMilliseconds(0);
	if (unit === "SECOND") {
		const seconds = Math.floor(bucketStart.getUTCSeconds() / amount) * amount;
		bucketStart.setUTCSeconds(seconds, 0);
		return bucketStart;
	}

	const minutes = Math.floor(bucketStart.getUTCMinutes() / amount) * amount;
	bucketStart.setUTCMinutes(minutes, 0, 0);
	return bucketStart;
}

function addBucketDuration(timestamp: Date, timeRange: LogTimeRange) {
	const { amount, unit } = RANGE_BUCKET[timeRange];
	const nextBucket = new Date(timestamp);

	if (unit === "SECOND") {
		nextBucket.setUTCSeconds(nextBucket.getUTCSeconds() + amount);
		return nextBucket;
	}

	nextBucket.setUTCMinutes(nextBucket.getUTCMinutes() + amount);
	return nextBucket;
}

function buildBucketKeys(timestamps: Date[], timeRange: LogTimeRange) {
	if (timestamps.length === 0) return [];

	const sortedBucketStarts = timestamps
		.map((timestamp) => getBucketStart(timestamp, timeRange))
		.sort((a, b) => a.getTime() - b.getTime());

	const bucketKeys: string[] = [];
	let currentBucket = sortedBucketStarts[0];
	const lastBucket = sortedBucketStarts.at(-1);
	if (!lastBucket) return [];

	while (currentBucket.getTime() <= lastBucket.getTime()) {
		bucketKeys.push(currentBucket.toISOString());
		currentBucket = addBucketDuration(currentBucket, timeRange);
	}

	return bucketKeys;
}

export function computeLogsPatternGroups({
	rows,
	source,
	timeRange,
}: {
	rows: ClickhouseRow[];
	source: LogSourceEntity | null;
	timeRange: LogTimeRange;
}): LogsPatternComputationResult {
	const resolvedKeys = resolveFieldKeys(rows, source);

	if (rows.length === 0) {
		return {
			groups: [],
			...resolvedKeys,
			missingRequiredFields: [],
		};
	}

	const missingRequiredFields: Array<"body" | "timestamp"> = [];

	if (!resolvedKeys.bodyKey) {
		missingRequiredFields.push("body");
	}
	if (!resolvedKeys.timestampKey) {
		missingRequiredFields.push("timestamp");
	}

	if (missingRequiredFields.length > 0) {
		return {
			groups: [],
			...resolvedKeys,
			missingRequiredFields,
		};
	}

	const bodyKey = resolvedKeys.bodyKey!;
	const timestampKey = resolvedKeys.timestampKey!;

	const bucketTimestamps = rows
		.map((row) => parseTimestamp(row[timestampKey]))
		.filter((timestamp): timestamp is Date => timestamp != null);
	const bucketKeys = buildBucketKeys(bucketTimestamps, timeRange);

	if (bucketKeys.length === 0) {
		return {
			groups: [],
			...resolvedKeys,
			missingRequiredFields: ["timestamp"],
		};
	}

	const patternGroups = new Map<
		string,
		{
			pattern: string;
			samples: ClickhouseRow[];
			levelCounts: Map<string, number>;
			latestTimestamp: string | null;
			latestTimestampMs: number;
			buckets: Map<string, number>;
		}
	>();

	for (const row of rows) {
		const pattern = normalizePatternText(row[bodyKey]);
		if (!pattern) continue;

		const timestamp = parseTimestamp(row[timestampKey]);
		if (!timestamp) continue;

		const bucketStart = getBucketStart(timestamp, timeRange).toISOString();
		const group = patternGroups.get(pattern) ?? {
			pattern,
			samples: [],
			levelCounts: new Map<string, number>(),
			latestTimestamp: null,
			latestTimestampMs: Number.NEGATIVE_INFINITY,
			buckets: new Map<string, number>(),
		};

		group.samples.push(row);
		group.buckets.set(bucketStart, (group.buckets.get(bucketStart) ?? 0) + 1);

		const level = normalizeLevel(
			resolvedKeys.levelKey ? row[resolvedKeys.levelKey] : null,
		);
		if (level) {
			group.levelCounts.set(level, (group.levelCounts.get(level) ?? 0) + 1);
		}

		const timestampMs = timestamp.getTime();
		if (timestampMs >= group.latestTimestampMs) {
			group.latestTimestampMs = timestampMs;
			group.latestTimestamp = timestamp.toISOString();
		}

		patternGroups.set(pattern, group);
	}

	const groups = Array.from(patternGroups.values())
		.map<LogsPatternGroup>((group) => {
			const dominantLevel =
				Array.from(group.levelCounts.entries()).sort((a, b) => {
					if (b[1] !== a[1]) return b[1] - a[1];
					return getSeverityRank(a[0]) - getSeverityRank(b[0]);
				})[0]?.[0] ?? null;

			const count = group.samples.length;
			return {
				id: group.pattern,
				pattern: group.pattern,
				count,
				countLabel: `~${count.toLocaleString()}`,
				level: dominantLevel,
				samples: group.samples,
				latestTimestamp: group.latestTimestamp,
				trend: bucketKeys.map((bucketStart) => ({
					bucketStart,
					count: group.buckets.get(bucketStart) ?? 0,
				})),
			};
		})
		.sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return (
				new Date(b.latestTimestamp ?? 0).getTime() -
				new Date(a.latestTimestamp ?? 0).getTime()
			);
		});

	return {
		groups,
		...resolvedKeys,
		missingRequiredFields,
	};
}
