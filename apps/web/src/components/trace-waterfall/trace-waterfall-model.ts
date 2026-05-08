import type { DataRow } from "@/web/components/data-row-side-panel";

const TRACE_ALIAS_PREFIX = "__loglog_trace_";

export const TRACE_ALIASES = {
	timestamp: `${TRACE_ALIAS_PREFIX}timestamp`,
	traceId: `${TRACE_ALIAS_PREFIX}trace_id`,
	spanId: `${TRACE_ALIAS_PREFIX}span_id`,
	parentSpanId: `${TRACE_ALIAS_PREFIX}parent_span_id`,
	name: `${TRACE_ALIAS_PREFIX}name`,
	serviceName: `${TRACE_ALIAS_PREFIX}service_name`,
	duration: `${TRACE_ALIAS_PREFIX}duration`,
	statusCode: `${TRACE_ALIAS_PREFIX}status_code`,
	statusMessage: `${TRACE_ALIAS_PREFIX}status_message`,
	spanKind: `${TRACE_ALIAS_PREFIX}span_kind`,
	body: `${TRACE_ALIAS_PREFIX}body`,
	severityText: `${TRACE_ALIAS_PREFIX}severity_text`,
	severityNumber: `${TRACE_ALIAS_PREFIX}severity_number`,
} as const;

export type TraceWaterfallItemKind = "trace" | "span" | "log";

export type TraceWaterfallStatus = "success" | "error" | "warning" | "unknown";

export type TraceWaterfallNode = {
	id: string;
	kind: TraceWaterfallItemKind;
	traceId: string;
	spanId?: string;
	parentSpanId?: string;
	name: string;
	serviceName?: string;
	body?: string;
	status: TraceWaterfallStatus;
	statusMessage?: string;
	startTimeNs: bigint;
	durationNs?: bigint;
	depth: number;
	warning?: "missing-span-id" | "unmatched-span-id";
	raw?: DataRow;
	children: TraceWaterfallNode[];
};

export type TraceWaterfallFlatNode = TraceWaterfallNode & {
	children: TraceWaterfallNode[];
	hasChildren: boolean;
};

export type TraceWaterfallTree = {
	root: TraceWaterfallNode;
	flatNodes: TraceWaterfallFlatNode[];
	totalSpans: number;
	totalLogs: number;
	unmatchedLogs: number;
	traceDurationNs?: bigint;
	startTimeNs?: bigint;
	endTimeNs?: bigint;
};

export type BuildTraceWaterfallTreeInput = {
	traceId: string;
	spans: DataRow[];
	logs: DataRow[];
	durationPrecision?: number | null;
};

const FIELD_FALLBACKS = {
	timestamp: [TRACE_ALIASES.timestamp, "Timestamp", "timestamp", "time", "ts"],
	traceId: [TRACE_ALIASES.traceId, "TraceId", "traceId", "trace_id"],
	spanId: [TRACE_ALIASES.spanId, "SpanId", "spanId", "span_id"],
	parentSpanId: [
		TRACE_ALIASES.parentSpanId,
		"ParentSpanId",
		"parentSpanId",
		"parent_span_id",
	],
	name: [TRACE_ALIASES.name, "SpanName", "spanName", "span_name"],
	serviceName: [
		TRACE_ALIASES.serviceName,
		"ServiceName",
		"serviceName",
		"service_name",
		"service",
	],
	duration: [
		TRACE_ALIASES.duration,
		"Duration",
		"duration",
		"DurationNano",
		"durationNano",
	],
	statusCode: [
		TRACE_ALIASES.statusCode,
		"StatusCode",
		"statusCode",
		"status_code",
	],
	statusMessage: [
		TRACE_ALIASES.statusMessage,
		"StatusMessage",
		"statusMessage",
		"status_message",
	],
	spanKind: [TRACE_ALIASES.spanKind, "SpanKind", "spanKind", "span_kind"],
	body: [TRACE_ALIASES.body, "Body", "body", "message", "Message", "msg"],
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
} as const;

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

function valueFor(row: DataRow, keys: readonly string[]) {
	const key = findKeyCaseInsensitive(row, keys);
	return key ? row[key] : undefined;
}

function meaningfulString(value: unknown) {
	if (value == null) return undefined;
	const text = String(value).trim();
	return text.length > 0 ? text : undefined;
}

function parseDecimalToBigInt(value: unknown) {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return undefined;
		return BigInt(Math.trunc(value));
	}

	const text = meaningfulString(value);
	if (!text) return undefined;
	const normalized = text.includes(".") ? text.split(".")[0] : text;
	if (!/^-?\d+$/u.test(normalized)) return undefined;
	return BigInt(normalized);
}

function parseTimestampNs(value: unknown, fallbackIndex: number) {
	if (value instanceof Date) {
		return BigInt(value.getTime()) * 1_000_000n;
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value)) return BigInt(fallbackIndex);
		return BigInt(Math.trunc(value)) * 1_000_000n;
	}

	const text = meaningfulString(value);
	if (!text) return BigInt(fallbackIndex);

	const match = text.match(
		/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-]\d{2}:?\d{2}))?$/u,
	);

	if (match) {
		const [, year, month, day, hour, minute, second, fraction = ""] = match;
		const milliseconds = Date.UTC(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			Number(second),
		);
		const fractionNs = BigInt(fraction.padEnd(9, "0").slice(0, 9) || "0");
		return BigInt(milliseconds) * 1_000_000n + fractionNs;
	}

	const parsed = Date.parse(text);
	if (!Number.isNaN(parsed)) {
		return BigInt(parsed) * 1_000_000n;
	}

	return BigInt(fallbackIndex);
}

function normalizeDurationNs(value: unknown, durationPrecision: number) {
	const duration = parseDecimalToBigInt(value);
	if (duration == null || duration < 0n) return undefined;
	const precision = Math.min(Math.max(Math.trunc(durationPrecision), 0), 9);
	return duration * 10n ** BigInt(9 - precision);
}

function normalizeStatus(
	kind: TraceWaterfallItemKind,
	statusCodeValue: unknown,
	statusMessageValue: unknown,
	severityTextValue?: unknown,
	severityNumberValue?: unknown,
): TraceWaterfallStatus {
	const statusCode = meaningfulString(statusCodeValue)?.toLowerCase();
	const statusMessage = meaningfulString(statusMessageValue)?.toLowerCase();
	const severityText = meaningfulString(severityTextValue)?.toLowerCase();
	const severityNumber = Number(severityNumberValue);

	if (
		statusCode === "error" ||
		statusCode === "2" ||
		statusMessage?.includes("error") ||
		severityText === "error" ||
		severityText === "fatal" ||
		(Number.isFinite(severityNumber) && severityNumber >= 17)
	) {
		return "error";
	}

	if (
		kind === "log" &&
		(severityText === "warn" || severityText === "warning")
	) {
		return "warning";
	}

	if (statusCode === "ok" || statusCode === "unset" || statusCode === "1") {
		return "success";
	}

	return kind === "span" ? "success" : "unknown";
}

function sortNodes(nodes: TraceWaterfallNode[]) {
	nodes.sort((a, b) => {
		if (a.startTimeNs === b.startTimeNs) return a.id.localeCompare(b.id);
		return a.startTimeNs < b.startTimeNs ? -1 : 1;
	});
	for (const node of nodes) {
		sortNodes(node.children);
	}
}

function cloneNodeWithDepth(
	node: TraceWaterfallNode,
	depth: number,
): TraceWaterfallNode {
	const children = node.children.map((child) =>
		cloneNodeWithDepth(child, depth + 1),
	);
	return { ...node, depth, children };
}

function flattenNodes(root: TraceWaterfallNode) {
	const flatNodes: TraceWaterfallFlatNode[] = [];
	const stack = [root];

	while (stack.length > 0) {
		const node = stack.pop();
		if (!node) continue;
		flatNodes.push({
			...node,
			children: node.children,
			hasChildren: node.children.length > 0,
		});

		for (let index = node.children.length - 1; index >= 0; index--) {
			stack.push(node.children[index]);
		}
	}

	return flatNodes;
}

function endTimeForNode(node: TraceWaterfallNode) {
	return node.durationNs == null
		? node.startTimeNs
		: node.startTimeNs + node.durationNs;
}

function normalizeSpan(
	row: DataRow,
	index: number,
	traceId: string,
	durationPrecision: number,
): TraceWaterfallNode {
	const spanId = meaningfulString(valueFor(row, FIELD_FALLBACKS.spanId));
	const parentSpanId = meaningfulString(
		valueFor(row, FIELD_FALLBACKS.parentSpanId),
	);
	const name =
		meaningfulString(valueFor(row, FIELD_FALLBACKS.name)) ?? "Unknown span";
	const statusMessage = meaningfulString(
		valueFor(row, FIELD_FALLBACKS.statusMessage),
	);

	return {
		id: spanId ? `span:${spanId}` : `span:missing:${index}`,
		kind: "span",
		traceId,
		spanId,
		parentSpanId,
		name,
		serviceName: meaningfulString(valueFor(row, FIELD_FALLBACKS.serviceName)),
		status: normalizeStatus(
			"span",
			valueFor(row, FIELD_FALLBACKS.statusCode),
			statusMessage,
		),
		statusMessage,
		startTimeNs: parseTimestampNs(
			valueFor(row, FIELD_FALLBACKS.timestamp),
			index,
		),
		durationNs: normalizeDurationNs(
			valueFor(row, FIELD_FALLBACKS.duration),
			durationPrecision,
		),
		depth: 0,
		raw: row,
		children: [],
	};
}

function normalizeLog(
	row: DataRow,
	index: number,
	traceId: string,
): TraceWaterfallNode {
	const spanId = meaningfulString(valueFor(row, FIELD_FALLBACKS.spanId));
	const body = meaningfulString(valueFor(row, FIELD_FALLBACKS.body));
	const name = body ?? "Log event";
	const statusMessage = meaningfulString(
		valueFor(row, FIELD_FALLBACKS.severityText),
	);

	return {
		id: `log:${spanId ?? "missing"}:${index}`,
		kind: "log",
		traceId,
		spanId,
		name,
		body,
		serviceName: meaningfulString(valueFor(row, FIELD_FALLBACKS.serviceName)),
		status: normalizeStatus(
			"log",
			undefined,
			undefined,
			statusMessage,
			valueFor(row, FIELD_FALLBACKS.severityNumber),
		),
		statusMessage,
		startTimeNs: parseTimestampNs(
			valueFor(row, FIELD_FALLBACKS.timestamp),
			index,
		),
		depth: 0,
		raw: row,
		children: [],
	};
}

export function formatDurationNs(durationNs: bigint | undefined) {
	if (durationNs == null) return "";
	const absDuration = durationNs < 0n ? -durationNs : durationNs;
	if (absDuration < 1_000n) return `${durationNs.toString()} ns`;

	const microseconds = Number(durationNs) / 1_000;
	if (Math.abs(microseconds) < 1_000) return `${microseconds.toFixed(1)} us`;

	const milliseconds = microseconds / 1_000;
	if (Math.abs(milliseconds) < 1_000) return `${milliseconds.toFixed(1)} ms`;

	const seconds = milliseconds / 1_000;
	return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
}

export function stripTraceInternalAliases(row: DataRow): DataRow {
	return Object.fromEntries(
		Object.entries(row).filter(([key]) => !key.startsWith(TRACE_ALIAS_PREFIX)),
	);
}

export function buildTraceWaterfallTree({
	traceId,
	spans,
	logs,
	durationPrecision = 9,
}: BuildTraceWaterfallTreeInput): TraceWaterfallTree {
	const spanNodes = spans.map((row, index) =>
		normalizeSpan(row, index, traceId, durationPrecision ?? 9),
	);
	const logNodes = logs.map((row, index) => normalizeLog(row, index, traceId));

	spanNodes.sort((a, b) =>
		a.startTimeNs === b.startTimeNs
			? a.id.localeCompare(b.id)
			: a.startTimeNs < b.startTimeNs
				? -1
				: 1,
	);

	const spanMap = new Map<string, TraceWaterfallNode>();
	for (const span of spanNodes) {
		if (span.spanId && !spanMap.has(span.spanId)) {
			spanMap.set(span.spanId, span);
		}
	}

	const roots: TraceWaterfallNode[] = [];
	for (const span of spanNodes) {
		const parent = span.parentSpanId
			? spanMap.get(span.parentSpanId)
			: undefined;
		if (parent && parent !== span) {
			parent.children.push(span);
		} else {
			roots.push(span);
		}
	}

	let unmatchedLogs = 0;
	for (const log of logNodes) {
		const parent = log.spanId ? spanMap.get(log.spanId) : undefined;
		if (parent) {
			parent.children.push(log);
			continue;
		}

		unmatchedLogs++;
		roots.push({
			...log,
			warning: log.spanId ? "unmatched-span-id" : "missing-span-id",
		});
	}

	sortNodes(roots);

	const timedNodes = [...spanNodes, ...logNodes].filter(
		(node) => node.startTimeNs > 0n,
	);
	const startTimeNs =
		timedNodes.length > 0
			? timedNodes.reduce(
					(min, node) => (node.startTimeNs < min ? node.startTimeNs : min),
					timedNodes[0].startTimeNs,
				)
			: undefined;
	const endTimeNs =
		timedNodes.length > 0
			? timedNodes.reduce((max, node) => {
					const nodeEnd = endTimeForNode(node);
					return nodeEnd > max ? nodeEnd : max;
				}, endTimeForNode(timedNodes[0]))
			: undefined;
	const traceDurationNs =
		startTimeNs != null && endTimeNs != null && endTimeNs >= startTimeNs
			? endTimeNs - startTimeNs
			: undefined;

	const root: TraceWaterfallNode = {
		id: `trace:${traceId}`,
		kind: "trace",
		traceId,
		name: "TRACE",
		status: spanNodes.some((node) => node.status === "error")
			? "error"
			: unmatchedLogs > 0
				? "warning"
				: "success",
		startTimeNs: startTimeNs ?? 0n,
		durationNs: traceDurationNs,
		depth: 0,
		children: roots.map((node) => cloneNodeWithDepth(node, 1)),
	};

	return {
		root,
		flatNodes: flattenNodes(root),
		totalSpans: spanNodes.length,
		totalLogs: logNodes.length,
		unmatchedLogs,
		traceDurationNs,
		startTimeNs,
		endTimeNs,
	};
}

export function filterTraceWaterfallTree(
	node: TraceWaterfallNode,
	query: string,
): TraceWaterfallNode | null {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return node;

	const ownText = [
		node.name,
		node.serviceName,
		node.spanId,
		node.parentSpanId,
		node.body,
		node.status,
		node.statusMessage,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	const children = node.children
		.map((child) => filterTraceWaterfallTree(child, normalizedQuery))
		.filter((child): child is TraceWaterfallNode => child != null);

	if (ownText.includes(normalizedQuery) || children.length > 0) {
		return {
			...node,
			children,
		};
	}

	return null;
}
