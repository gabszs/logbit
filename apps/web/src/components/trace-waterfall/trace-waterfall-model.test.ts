import { describe, expect, it } from "bun:test";
import {
	buildTraceWaterfallTree,
	filterTraceWaterfallTree,
	formatDurationNs,
	resolveTraceWaterfallInitialHighlightNodeId,
	TRACE_ALIASES,
} from "./trace-waterfall-model";

describe("buildTraceWaterfallTree", () => {
	it("wraps spans in TRACE and preserves parent-child order by timestamp", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-1",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000200",
					[TRACE_ALIASES.traceId]: "trace-1",
					[TRACE_ALIASES.spanId]: "child-b",
					[TRACE_ALIASES.parentSpanId]: "root",
					[TRACE_ALIASES.name]: "child b",
					[TRACE_ALIASES.duration]: "1000000",
				},
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.traceId]: "trace-1",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.name]: "root span",
					[TRACE_ALIASES.duration]: "5000000",
				},
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000100",
					[TRACE_ALIASES.traceId]: "trace-1",
					[TRACE_ALIASES.spanId]: "child-a",
					[TRACE_ALIASES.parentSpanId]: "root",
					[TRACE_ALIASES.name]: "child a",
					[TRACE_ALIASES.duration]: "1000000",
				},
			],
			logs: [],
			durationPrecision: 9,
		});

		expect(tree.root.name).toBe("TRACE");
		expect(tree.root.children.map((node) => node.spanId)).toEqual(["root"]);
		expect(tree.root.children[0].children.map((node) => node.spanId)).toEqual([
			"child-a",
			"child-b",
		]);
		expect(tree.flatNodes.map((node) => node.name)).toEqual([
			"TRACE",
			"root span",
			"child a",
			"child b",
		]);
	});

	it("attaches logs to matching spans and promotes unmatched logs to roots", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-2",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "span-1",
					[TRACE_ALIASES.name]: "GET /api",
				},
			],
			logs: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
					[TRACE_ALIASES.spanId]: "span-1",
					[TRACE_ALIASES.body]: "inside span",
				},
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000020",
					[TRACE_ALIASES.body]: "missing span id",
				},
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000030",
					[TRACE_ALIASES.spanId]: "ghost",
					[TRACE_ALIASES.body]: "unknown span",
				},
			],
		});

		const [spanRoot, missingLog, unmatchedLog] = tree.root.children;
		expect(spanRoot.children.map((node) => node.body)).toEqual(["inside span"]);
		expect(missingLog.warning).toBe("missing-span-id");
		expect(unmatchedLog.warning).toBe("unmatched-span-id");
		expect(tree.unmatchedLogs).toBe(2);
	});

	it("promotes orphan spans to roots", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-3",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "orphan",
					[TRACE_ALIASES.parentSpanId]: "missing-parent",
					[TRACE_ALIASES.name]: "orphan span",
				},
			],
			logs: [],
		});

		expect(tree.root.children).toHaveLength(1);
		expect(tree.root.children[0].name).toBe("orphan span");
	});

	it("formats durations using trace duration precision", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-4",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "span-1",
					[TRACE_ALIASES.name]: "span",
					[TRACE_ALIASES.duration]: "1500",
				},
			],
			logs: [],
			durationPrecision: 6,
		});

		expect(formatDurationNs(tree.root.children[0].durationNs)).toBe("1.5 ms");
	});
});

describe("filterTraceWaterfallTree", () => {
	it("keeps ancestors of matching nodes", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-5",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.name]: "root",
				},
			],
			logs: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.body]: "needle log",
				},
			],
		});

		const filtered = filterTraceWaterfallTree(tree.root, "needle");
		expect(filtered?.children[0].children[0].body).toBe("needle log");
	});
});

describe("resolveTraceWaterfallInitialHighlightNodeId", () => {
	it("selects the clicked span", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-6",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.name]: "root",
				},
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
					[TRACE_ALIASES.spanId]: "child",
					[TRACE_ALIASES.parentSpanId]: "root",
					[TRACE_ALIASES.name]: "clicked span",
				},
			],
			logs: [],
		});

		expect(
			resolveTraceWaterfallInitialHighlightNodeId(tree, {
				kind: "span",
				traceId: "trace-6",
				spanId: "child",
				parentSpanId: "root",
				name: "clicked span",
			}),
		).toBe("span:child");
	});

	it("selects the clicked log among multiple logs in the same span", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-7",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.name]: "root",
				},
			],
			logs: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.body]: "first log",
					[TRACE_ALIASES.severityText]: "INFO",
				},
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000020",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.body]: "clicked log",
					[TRACE_ALIASES.severityText]: "ERROR",
				},
			],
		});

		expect(
			resolveTraceWaterfallInitialHighlightNodeId(tree, {
				kind: "log",
				traceId: "trace-7",
				spanId: "root",
				timestamp: "2026-05-08 10:00:00.000000020",
				body: "clicked log",
				severityText: "ERROR",
			}),
		).toBe("log:root:1");
	});

	it("differentiates logs by timestamp and severity when the body matches", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-8",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.name]: "root",
				},
			],
			logs: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.body]: "same body",
					[TRACE_ALIASES.severityText]: "INFO",
				},
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000020",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.body]: "same body",
					[TRACE_ALIASES.severityText]: "WARN",
				},
			],
		});

		expect(
			resolveTraceWaterfallInitialHighlightNodeId(tree, {
				kind: "log",
				traceId: "trace-8",
				spanId: "root",
				timestamp: "2026-05-08 10:00:00.000000020",
				body: "same body",
				severityText: "WARN",
			}),
		).toBe("log:root:1");
	});

	it("falls back to the matching span when the clicked log is not in the trace", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-9",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.name]: "root",
				},
			],
			logs: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000010",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.body]: "other log",
				},
			],
		});

		expect(
			resolveTraceWaterfallInitialHighlightNodeId(tree, {
				kind: "log",
				traceId: "trace-9",
				spanId: "root",
				timestamp: "2026-05-08 10:00:00.000000020",
				body: "missing log",
			}),
		).toBe("span:root");
	});

	it("falls back to the first visible root when nothing matches", () => {
		const tree = buildTraceWaterfallTree({
			traceId: "trace-10",
			spans: [
				{
					[TRACE_ALIASES.timestamp]: "2026-05-08 10:00:00.000000000",
					[TRACE_ALIASES.spanId]: "root",
					[TRACE_ALIASES.name]: "root",
				},
			],
			logs: [],
		});

		expect(
			resolveTraceWaterfallInitialHighlightNodeId(tree, {
				kind: "span",
				traceId: "trace-10",
				spanId: "missing",
				name: "missing span",
			}),
		).toBe("span:root");
	});
});
