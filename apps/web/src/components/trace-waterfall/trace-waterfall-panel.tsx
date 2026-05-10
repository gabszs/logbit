import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Download,
	FileText,
	GripVertical,
	Info,
	ListTree,
	Loader2,
	MoveHorizontal,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { usePanelResize } from "@/web/hooks/use-panel-resize";
import type { DataRow } from "@/web/lib/data-row";
import { cn } from "@/web/utils/cn";
import {
	buildTraceWaterfallTree,
	filterTraceWaterfallTree,
	formatDurationNs,
	resolveTraceWaterfallInitialHighlightNodeId,
	stripTraceInternalAliases,
	type TraceWaterfallInitialHighlightHint,
	type TraceWaterfallNode,
	type TraceWaterfallNodeSelection,
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
	initialHighlightHint?: TraceWaterfallInitialHighlightHint;
	initialHighlightKey?: string;
	onNodeSelect?: (selection: TraceWaterfallNodeSelection) => void;
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

function findAncestorNodeIds(root: TraceWaterfallNode, targetNodeId: string) {
	const ancestors: string[] = [];

	function visit(node: TraceWaterfallNode): boolean {
		if (node.id === targetNodeId) return true;
		for (const child of node.children) {
			if (visit(child)) {
				ancestors.push(node.id);
				return true;
			}
		}
		return false;
	}

	visit(root);
	return ancestors;
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
	onNodeSelect,
	rowRef,
}: {
	item: VisibleTraceNode;
	isSelected: boolean;
	isCollapsed: boolean;
	hasSearch: boolean;
	onToggleCollapse: (nodeId: string) => void;
	onSelect: (nodeId: string) => void;
	onNodeSelect?: (selection: TraceWaterfallNodeSelection) => void;
	rowRef: (element: HTMLDivElement | null) => void;
}) {
	const { node } = item;
	const hasChildren = node.children.length > 0;
	const duration = formatDurationNs(node.durationNs);
	const childrenVisible = hasChildren && (!isCollapsed || hasSearch);

	const selectRow = () => {
		onSelect(node.id);
		if (node.kind === "trace" || !node.raw) return;
		onNodeSelect?.({
			kind: node.kind,
			nodeId: node.id,
			row: node.raw,
			traceId: node.traceId,
			spanId: node.spanId,
		});
	};

	return (
		<div
			ref={rowRef}
			className={cn(
				"group relative flex min-h-7 w-full cursor-pointer rounded-md pr-2 text-left text-xs transition-colors",
				"focus-within:bg-muted/60 hover:bg-muted/60",
				isSelected && "bg-muted/80 text-foreground",
			)}
		>
			<button
				type="button"
				className="absolute inset-0 z-20 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
				onClick={selectRow}
				title={node.warning ? "Log is not attached to a known span" : node.name}
				aria-label={`Inspect ${node.kind} ${node.name}`}
			/>
			<div className="flex w-full pl-2">
				{/* Ancestor columns: one per ancestor level above the immediate parent.
				    ancestorHasNext[i+1] tells whether the ancestor at level i has more siblings,
				    which determines if the vertical continuation line should be drawn. */}
				{item.depth > 0 &&
					item.ancestorHasNext.slice(1).map((hasNext, i) => (
						<div key={i} className="relative w-5 shrink-0">
							{hasNext && (
								<span className="absolute top-0 bottom-0 left-3 w-px bg-[color:var(--surface-border)]" />
							)}
						</div>
					))}
				{/* Current level elbow: vertical bars + horizontal connector to icon */}
				{item.depth > 0 && (
					<div className="relative w-5 shrink-0">
						<span
							className={cn(
								"absolute left-3 w-px bg-[color:var(--surface-border)]",
								!item.hasNextSibling ? "top-0 h-3" : "top-0 bottom-3",
							)}
						/>
						{item.hasNextSibling && (
							<span className="absolute top-3 bottom-0 left-3 w-px bg-[color:var(--surface-border)]" />
						)}
						<span className="absolute top-3 left-3 h-px w-2 bg-[color:var(--surface-border)]" />
					</div>
				)}
				{/* Icon badge + downward connector when node has visible children */}
				<div
					className="group/icon relative z-30 flex w-6 shrink-0 flex-col py-1.5"
					onClick={selectRow}
				>
					{childrenVisible && (
						<span className="absolute left-3 top-[27px] bottom-0 w-px bg-[color:var(--surface-border)]" />
					)}
					<div className="flex h-4 items-center justify-center">
						<span
							className={cn(
								"flex size-5 shrink-0 items-center justify-center rounded-sm",
								"border border-transparent bg-[color:var(--surface-background)]",
								"transition-colors group-hover/icon:border-[color:var(--surface-border)]",
							)}
						>
							{iconForNode(node, item.depth === 0 && node.kind === "span")}
						</span>
					</div>
				</div>
				{/* Content + warning badge + collapse button + duration */}
				<div className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1">
					<span className="relative z-10 min-w-0 flex-1 truncate font-medium">
						{node.kind === "log" ? (node.body ?? node.name) : node.name}
					</span>
					{node.warning ? (
						<span className="relative z-10 shrink-0 rounded border border-amber-300/60 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-300">
							no span
						</span>
					) : null}
					{hasChildren ? (
						<span className="relative z-30 flex size-4 shrink-0 items-center justify-center">
							<button
								type="button"
								className="flex size-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								aria-label={
									isCollapsed && !hasSearch
										? `Expand ${node.name}`
										: `Collapse ${node.name}`
								}
								onClick={(event) => {
									event.stopPropagation();
									onToggleCollapse(node.id);
								}}
								onKeyDown={(event) => {
									event.stopPropagation();
								}}
							>
								{isCollapsed && !hasSearch ? (
									<ChevronRight className="size-3" />
								) : (
									<ChevronDown className="size-3" />
								)}
							</button>
						</span>
					) : null}
					{duration ? (
						<span className="relative z-10 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
							{duration}
						</span>
					) : null}
				</div>
			</div>
		</div>
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
	initialHighlightHint,
	initialHighlightKey,
	onNodeSelect,
	className,
}: TraceWaterfallPanelProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [pendingScrollNodeId, setPendingScrollNodeId] = useState<string | null>(
		null,
	);
	const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
		() => new Set(),
	);
	const appliedHighlightKeyRef = useRef<string | null>(null);
	const rowElementsRef = useRef(new Map<string, HTMLDivElement>());

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

	useEffect(() => {
		if (!tree || !initialHighlightKey) return;
		if (appliedHighlightKeyRef.current === initialHighlightKey) return;

		const highlightedNodeId = resolveTraceWaterfallInitialHighlightNodeId(
			tree,
			initialHighlightHint,
		);
		if (!highlightedNodeId) return;

		appliedHighlightKeyRef.current = initialHighlightKey;
		setSearchQuery("");
		setSelectedNodeId(highlightedNodeId);
		setPendingScrollNodeId(highlightedNodeId);

		const ancestorNodeIds = new Set(
			findAncestorNodeIds(tree.root, highlightedNodeId),
		);
		setCollapsedNodeIds((current) => {
			if (current.size === 0) return current;
			const next = new Set(current);
			for (const nodeId of ancestorNodeIds) {
				next.delete(nodeId);
			}
			return next;
		});
	}, [initialHighlightHint, initialHighlightKey, tree]);

	useEffect(() => {
		if (!pendingScrollNodeId || collapsed) return;
		const element = rowElementsRef.current.get(pendingScrollNodeId);
		if (!element) return;

		window.requestAnimationFrame(() => {
			element.scrollIntoView({ block: "nearest" });
			setPendingScrollNodeId(null);
		});
	}, [collapsed, pendingScrollNodeId, visibleNodes]);

	const setTraceRowRef = (nodeId: string) => {
		return (element: HTMLDivElement | null) => {
			if (element) {
				rowElementsRef.current.set(nodeId, element);
			} else {
				rowElementsRef.current.delete(nodeId);
			}
		};
	};

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

	const traceResize = usePanelResize({
		direction: "right",
		defaultWidth: Math.floor(0.22 * window.innerWidth),
		minWidth: 250,
		maxWidth: Math.floor(window.innerWidth * 0.5),
	});

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
				"relative flex min-h-0 shrink-0 flex-col border-[color:var(--surface-border)] border-r bg-[color:var(--surface-background)] sm:max-w-[60%]",
				className,
			)}
			style={{ width: traceResize.width, flexBasis: traceResize.width }}
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
								onNodeSelect={onNodeSelect}
								rowRef={setTraceRowRef(item.node.id)}
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
			{/* Resize handle — right edge */}
			<div
				ref={traceResize.handleRef}
				className={cn(
					"group/resize absolute inset-y-0 -right-1 z-20 flex w-2 cursor-col-resize items-center justify-center",
					traceResize.isResizing && "bg-primary/10",
				)}
				title="Drag to resize (double-click to reset)"
			>
				<span
					className={cn(
						"flex h-8 w-4 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover/resize:opacity-100",
						traceResize.isResizing && "opacity-100",
					)}
				>
					<GripVertical className="size-3 text-muted-foreground" />
				</span>
			</div>
		</aside>
	);
}
