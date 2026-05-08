import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Download,
	FileText,
	Info,
	ListTree,
	Loader2,
	MoveHorizontal,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DataRow } from "@/web/components/data-row-side-panel";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { cn } from "@/web/utils/cn";
import {
	buildTraceWaterfallTree,
	filterTraceWaterfallTree,
	formatDurationNs,
	stripTraceInternalAliases,
	type TraceWaterfallNode,
	type TraceWaterfallStatus,
} from "./trace-waterfall-model";

type TraceWaterfallPanelStatus =
	| "setup-required"
	| "loading"
	| "error"
	| "empty"
	| "ready";

export type TraceWaterfallPanelProps = {
	status: TraceWaterfallPanelStatus;
	traceId?: string;
	spans?: DataRow[];
	logs?: DataRow[];
	durationPrecision?: number;
	limit?: number;
	truncated?: boolean;
	traceSourceName?: string;
	logSourceName?: string;
	setupTitle?: string;
	setupDescription?: string;
	errorMessage?: string;
	className?: string;
};

function statusClassName(status: TraceWaterfallStatus) {
	if (status === "error") return "text-destructive";
	if (status === "warning") return "text-amber-600 dark:text-amber-500";
	if (status === "success") return "text-emerald-600 dark:text-emerald-500";
	return "text-muted-foreground";
}

function logSeverityClassName(severity: string | undefined) {
	switch (severity?.trim().toUpperCase()) {
		case "TRACE":
			return "text-stone-500 dark:text-stone-400";
		case "DEBUG":
			return "text-blue-600 dark:text-blue-400";
		case "INFO":
			return "text-emerald-600 dark:text-emerald-400";
		case "WARN":
		case "WARNING":
			return "text-amber-600 dark:text-amber-500";
		case "ERROR":
			return "text-red-600 dark:text-red-400";
		case "FATAL":
			return "text-purple-600 dark:text-purple-400";
		case "UNKNOWN":
			return "text-stone-400 italic dark:text-stone-500";
		default:
			return null;
	}
}

function iconForNode(node: TraceWaterfallNode, isRootSpan: boolean) {
	const iconClassName = cn("size-3.5", statusClassName(node.status));

	if (node.warning) {
		return (
			<AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-500" />
		);
	}

	if (node.kind === "log") {
		return (
			<FileText
				className={cn(
					"size-3.5",
					logSeverityClassName(node.statusMessage) ??
						statusClassName(node.status),
				)}
			/>
		);
	}

	if (isRootSpan) {
		return (
			<ListTree className="size-3.5 text-orange-500 dark:text-orange-400" />
		);
	}

	return <MoveHorizontal className={iconClassName} />;
}

type VisibleTraceNode = {
	node: TraceWaterfallNode;
	depth: number;
	ancestorHasNext: boolean[];
	hasNextSibling: boolean;
	isFirstSibling: boolean;
};

function flattenVisibleNodes(
	roots: TraceWaterfallNode[],
	collapsedNodeIds: Set<string>,
	searchQuery: string,
) {
	const nodes: VisibleTraceNode[] = [];
	const forceExpanded = searchQuery.trim().length > 0;

	function visit(
		node: TraceWaterfallNode,
		depth: number,
		ancestorHasNext: boolean[],
		index: number,
		siblings: TraceWaterfallNode[],
	) {
		const hasNextSibling = index < siblings.length - 1;
		nodes.push({
			node,
			depth,
			ancestorHasNext,
			hasNextSibling,
			isFirstSibling: index === 0,
		});
		if (!forceExpanded && collapsedNodeIds.has(node.id)) return;
		for (let childIndex = 0; childIndex < node.children.length; childIndex++) {
			visit(
				node.children[childIndex],
				depth + 1,
				[...ancestorHasNext, hasNextSibling],
				childIndex,
				node.children,
			);
		}
	}

	for (let index = 0; index < roots.length; index++) {
		visit(roots[index], 0, [], index, roots);
	}

	return nodes;
}

function StateBlock({
	icon,
	title,
	description,
}: {
	icon: "loading" | "error" | "info";
	title: string;
	description?: string;
}) {
	const Icon =
		icon === "loading" ? Loader2 : icon === "error" ? AlertTriangle : Info;
	return (
		<div className="flex min-h-0 flex-1 items-start justify-center px-4 py-6">
			<div className="w-full rounded-md border border-[color:var(--surface-border)] bg-muted/20 px-3 py-3 text-muted-foreground">
				<div className="flex items-center gap-2 font-medium text-foreground text-xs">
					<Icon
						className={cn(
							"size-4 shrink-0",
							icon === "loading" && "animate-spin",
							icon === "error" && "text-destructive",
						)}
					/>
					<span>{title}</span>
				</div>
				{description ? (
					<p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5">
						{description}
					</p>
				) : null}
			</div>
		</div>
	);
}

function TraceRow({
	item,
	isSelected,
	isCollapsed,
	hasSearch,
	onToggleCollapse,
	onSelect,
}: {
	item: VisibleTraceNode;
	isSelected: boolean;
	isCollapsed: boolean;
	hasSearch: boolean;
	onToggleCollapse: (nodeId: string) => void;
	onSelect: (nodeId: string) => void;
}) {
	const { node } = item;
	const hasChildren = node.children.length > 0;
	const duration = formatDurationNs(node.durationNs);
	const isFirstRoot = item.depth === 0 && item.isFirstSibling;
	const railWidth = isFirstRoot ? 0 : (item.depth + 1) * 16 + 10;
	const currentLineLeft = item.depth * 16 + 8;
	const shouldRenderBranchConnector = !isFirstRoot;
	const shouldRenderCurrentLine = !isFirstRoot;
	const ancestorLines = item.ancestorHasNext
		.map((hasNext, lineIndex) =>
			hasNext
				? {
						key: `${node.id}-ancestor-${lineIndex * 16 + 8}`,
						left: lineIndex * 16 + 8,
					}
				: null,
		)
		.filter((line): line is { key: string; left: number } => line != null);

	return (
		<button
			type="button"
			className={cn(
				"group relative flex min-h-7 w-full cursor-pointer items-center gap-1.5 rounded-lg pr-2 text-left text-xs transition-colors",
				"hover:bg-muted/60",
				isSelected && "bg-muted/80 text-foreground",
			)}
			onClick={() => {
				onSelect(node.id);
				if (hasChildren) {
					onToggleCollapse(node.id);
				}
			}}
			title={node.warning ? "Log is not attached to a known span" : node.name}
		>
			<span
				className="relative h-7 shrink-0 text-muted-foreground"
				style={{ width: railWidth }}
			>
				{ancestorLines.map((line) => (
					<span
						key={line.key}
						className="absolute top-0 bottom-0 w-px bg-[color:var(--surface-border)]"
						style={{ left: line.left }}
					/>
				))}
				{shouldRenderCurrentLine ? (
					<span
						className="absolute w-px bg-[color:var(--surface-border)]"
						style={{
							left: currentLineLeft,
							top: item.isFirstSibling ? "50%" : 0,
							bottom: item.hasNextSibling ? 0 : "50%",
						}}
					/>
				) : null}
				{shouldRenderBranchConnector ? (
					<span
						className="absolute h-px bg-[color:var(--surface-border)]"
						style={{
							left: currentLineLeft,
							top: "50%",
							width: 12,
						}}
					/>
				) : null}
			</span>
			{hasChildren ? (
				<span className="relative z-10 flex size-4 shrink-0 items-center justify-center">
					<span className="flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
						{isCollapsed && !hasSearch ? (
							<ChevronRight className="size-3" />
						) : (
							<ChevronDown className="size-3" />
						)}
					</span>
				</span>
			) : null}
			<span className="relative z-10 flex size-4 shrink-0 items-center justify-center">
				{iconForNode(node, item.depth === 0 && node.kind === "span")}
			</span>
			<span className="relative z-10 min-w-0 flex-1 truncate font-medium">
				{node.kind === "log" ? (node.body ?? node.name) : node.name}
			</span>
			{node.warning ? (
				<span className="relative z-10 shrink-0 rounded border border-amber-300/60 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-300">
					no span
				</span>
			) : null}
			{duration ? (
				<span className="relative z-10 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
					{duration}
				</span>
			) : null}
		</button>
	);
}

export function TraceWaterfallPanel({
	status,
	traceId,
	spans = [],
	logs = [],
	durationPrecision = 9,
	traceSourceName,
	logSourceName,
	setupTitle = "Trace source not configured",
	setupDescription,
	errorMessage,
	className,
}: TraceWaterfallPanelProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
		() => new Set(),
	);

	const tree = useMemo(() => {
		if (!traceId || status !== "ready") return null;
		return buildTraceWaterfallTree({
			traceId,
			spans,
			logs,
			durationPrecision,
		});
	}, [durationPrecision, logs, spans, status, traceId]);

	const visibleRoot = useMemo(() => {
		if (!tree) return null;
		return filterTraceWaterfallTree(tree.root, searchQuery);
	}, [searchQuery, tree]);

	const visibleNodes = useMemo(() => {
		if (!visibleRoot) return [];
		return flattenVisibleNodes(
			visibleRoot.children,
			collapsedNodeIds,
			searchQuery,
		);
	}, [collapsedNodeIds, searchQuery, visibleRoot]);

	const selectedId = selectedNodeId ?? visibleNodes[0]?.node.id ?? null;

	const handleToggleCollapse = (nodeId: string) => {
		setCollapsedNodeIds((current) => {
			const next = new Set(current);
			if (next.has(nodeId)) {
				next.delete(nodeId);
			} else {
				next.add(nodeId);
			}
			return next;
		});
	};

	const handleDownload = () => {
		if (!traceId) return;

		const payload = {
			traceId,
			traceSourceName,
			logSourceName,
			spans: spans.map(stripTraceInternalAliases),
			logs: logs.map(stripTraceInternalAliases),
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `trace-${traceId}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	};

	if (collapsed) {
		return (
			<aside
				className={cn(
					"flex w-12 shrink-0 flex-col border-[color:var(--surface-border)] border-r bg-[color:var(--surface-background)]",
					className,
				)}
			>
				<div className="flex h-14 items-center justify-center border-[color:var(--surface-border)] border-b">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-8 text-muted-foreground hover:text-foreground"
						onClick={() => setCollapsed(false)}
						title="Expand trace panel"
					>
						<PanelLeftOpen className="size-4" />
					</Button>
				</div>
				<div
					className="flex flex-1 items-center justify-center p-2"
					style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
				>
					<span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
						TRACE
					</span>
				</div>
			</aside>
		);
	}

	return (
		<aside
			className={cn(
				"flex min-h-0 shrink-0 basis-[30%] flex-col border-[color:var(--surface-border)] border-r bg-[color:var(--surface-background)] sm:min-w-[18rem] sm:max-w-[30rem]",
				className,
			)}
		>
			<div className="flex h-14 shrink-0 items-center gap-2 border-[color:var(--surface-border)] border-b px-3">
				<div className="min-w-0 flex-1">
					<div className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
						Trace
					</div>
					<div
						className="truncate font-mono text-foreground text-xs"
						title={traceId ?? "pending"}
					>
						{traceId ?? "pending"}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-8 text-muted-foreground hover:text-foreground"
						title="Collapse trace panel"
						onClick={() => setCollapsed(true)}
					>
						<PanelLeftClose className="size-4" />
					</Button>
				</div>
			</div>
			<div className="shrink-0 border-[color:var(--surface-border)] border-b p-3">
				<div className="flex items-center gap-2">
					<div className="relative min-w-0 flex-1">
						<Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
						<Input
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							placeholder="Search spans and logs"
							className="h-9 rounded-md bg-background pl-9 font-mono text-xs"
							disabled={status !== "ready"}
						/>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-9 shrink-0 border border-[color:var(--surface-border)] text-muted-foreground hover:text-foreground"
						title="Download trace JSON"
						disabled={status !== "ready" || !traceId}
						onClick={handleDownload}
					>
						<Download className="size-4" />
					</Button>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-2">
				{status === "setup-required" ? (
					<StateBlock
						icon="info"
						title={setupTitle}
						description={
							setupDescription ??
							"Trace attributes were detected, but this source has no correlated trace source configured."
						}
					/>
				) : status === "loading" ? (
					<StateBlock icon="loading" title="Loading trace" />
				) : status === "error" ? (
					<StateBlock
						icon="error"
						title="Could not load trace"
						description={errorMessage}
					/>
				) : status === "empty" || !tree || !visibleRoot ? (
					<StateBlock
						icon="info"
						title={
							searchQuery.trim() ? "No matches found" : "No trace data found"
						}
						description={
							searchQuery.trim()
								? "Search did not match spans or logs in this trace."
								: "No spans or logs were found for this trace id."
						}
					/>
				) : (
					<div className="flex flex-col">
						{visibleNodes.map((item) => (
							<TraceRow
								key={item.node.id}
								item={item}
								isSelected={selectedId === item.node.id}
								isCollapsed={collapsedNodeIds.has(item.node.id)}
								hasSearch={searchQuery.trim().length > 0}
								onToggleCollapse={handleToggleCollapse}
								onSelect={setSelectedNodeId}
							/>
						))}
					</div>
				)}
			</div>
			{status === "ready" && tree ? (
				<div className="shrink-0 border-[color:var(--surface-border)] border-t px-3 py-2 text-[10px] text-muted-foreground">
					<span>{tree.totalSpans} spans</span>
					<span className="mx-1.5">/</span>
					<span>{tree.totalLogs} logs</span>
					{tree.unmatchedLogs > 0 ? (
						<>
							<span className="mx-1.5">/</span>
							<span>{tree.unmatchedLogs} unlinked</span>
						</>
					) : null}
				</div>
			) : null}
		</aside>
	);
}
