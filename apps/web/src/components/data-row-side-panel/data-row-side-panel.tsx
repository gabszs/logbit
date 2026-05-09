import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, GripVertical, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TraceWaterfallPanel } from "@/web/components/trace-waterfall";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/web/components/ui/sheet";
import { usePanelResize } from "@/web/hooks/use-panel-resize";
import { cn } from "@/web/utils/cn";
import { BodyBlock } from "./body-block";
import { ColumnValuesSection } from "./column-values-section";
import { OverviewSection } from "./overview-section";
import { RowHeader } from "./row-header";
import type {
	DataRow,
	RowIdentity,
	RowPanelAdapter,
	RowTracePanelDescriptor,
} from "./types";

type PanelTab = "overview" | "values";

function StateMessage({
	title,
	description,
	variant = "default",
}: {
	title: string;
	description: string;
	variant?: "default" | "danger";
}) {
	return (
		<div className="flex min-h-[18rem] items-start justify-center px-5 py-6">
			<div
				className={
					variant === "danger"
						? "w-full rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive"
						: "w-full rounded-md border border-[color:var(--surface-border)] bg-muted/30 px-4 py-3 text-muted-foreground"
				}
			>
				<div className="flex items-center gap-2 font-medium text-sm">
					{variant === "danger" ? (
						<AlertTriangle className="size-4 shrink-0" />
					) : null}
					<span>{title}</span>
				</div>
				<p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-6">
					{description}
				</p>
			</div>
		</div>
	);
}

function SuccessPanel({
	row,
	identity,
	adapter,
}: {
	row: DataRow;
	identity: RowIdentity;
	adapter: RowPanelAdapter;
}) {
	const [activeTab, setActiveTab] = useState<PanelTab>("overview");
	const fields = useMemo(() => adapter.resolveFields(row), [adapter, row]);
	const overview = useMemo(
		() => adapter.getOverview?.(row, fields) ?? null,
		[adapter, row, fields],
	);
	const columnValues = adapter.getColumnValues?.(row) ?? row;
	const columnValuesLabel =
		adapter.getColumnValuesLabel?.(row, fields) ?? "Log/trace Values";
	const tabs: Array<{ id: PanelTab; label: string }> = overview
		? [
				{ id: "overview", label: "Overview" },
				{ id: "values", label: columnValuesLabel },
			]
		: [{ id: "values", label: columnValuesLabel }];

	useEffect(() => {
		setActiveTab(overview ? "overview" : "values");
	}, [identity.selectedRowKey, overview]);

	const selectedTab = overview ? activeTab : "values";

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<RowHeader fields={fields} tableLabel={identity.tableLabel} />
			<BodyBlock fields={fields} />
			<div className="scrollbar-hide overflow-x-auto border-[color:var(--surface-border)] border-b px-5">
				<nav
					aria-label="Row detail sections"
					className="flex min-w-max items-end gap-2"
				>
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							className={cn(
								"relative -mb-px h-11 overflow-hidden border-transparent border-b-2 px-3 font-medium text-muted-foreground text-sm transition-colors",
								selectedTab === tab.id && "border-primary text-foreground",
							)}
							onClick={() => setActiveTab(tab.id)}
						>
							{tab.label}
						</button>
					))}
				</nav>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{selectedTab === "overview" && overview ? (
					<OverviewSection overview={overview} />
				) : (
					<ColumnValuesSection row={columnValues} />
				)}
				{adapter.renderExtraSections?.(row)}
			</div>
		</div>
	);
}

function TracePanelSlot({
	identity,
	adapter,
	tracePanel,
}: {
	identity: RowIdentity;
	adapter: RowPanelAdapter;
	tracePanel: RowTracePanelDescriptor;
}) {
	const traceQuery = useQuery({
		queryKey:
			tracePanel.kind === "available"
				? (adapter.getTraceQueryKey?.(identity, tracePanel) ?? [
						"row-trace-panel",
						identity.selectedRowKey,
						tracePanel.traceId,
					])
				: ["row-trace-panel", identity.selectedRowKey, "setup-required"],
		queryFn: async () => {
			if (tracePanel.kind !== "available" || !adapter.fetchTrace) {
				throw new Error("Trace fetcher is not configured");
			}
			return await adapter.fetchTrace(identity, tracePanel);
		},
		enabled: tracePanel.kind === "available" && adapter.fetchTrace != null,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (tracePanel.kind === "setup-required") {
		return (
			<TraceWaterfallPanel
				status="setup-required"
				traceId={tracePanel.traceId}
				setupTitle={tracePanel.title}
				setupDescription={tracePanel.description}
			/>
		);
	}

	if (traceQuery.isPending || traceQuery.isFetching) {
		return (
			<TraceWaterfallPanel
				status="loading"
				traceId={tracePanel.traceId}
				traceSourceName={tracePanel.traceSourceName}
				logSourceName={tracePanel.logSourceName}
			/>
		);
	}

	if (traceQuery.error) {
		const errorMessage =
			adapter.formatError?.(traceQuery.error) ??
			(traceQuery.error instanceof Error
				? traceQuery.error.message
				: "Failed to load trace");
		return (
			<TraceWaterfallPanel
				status="error"
				traceId={tracePanel.traceId}
				traceSourceName={tracePanel.traceSourceName}
				logSourceName={tracePanel.logSourceName}
				errorMessage={errorMessage}
			/>
		);
	}

	const result = traceQuery.data;
	const rowCount = (result?.spans.length ?? 0) + (result?.logs.length ?? 0);
	return (
		<TraceWaterfallPanel
			status={rowCount > 0 ? "ready" : "empty"}
			traceId={tracePanel.traceId}
			spans={result?.spans ?? []}
			logs={result?.logs ?? []}
			durationPrecision={result?.durationPrecision ?? 9}
			limit={result?.limit ?? 5000}
			truncated={result?.truncated}
			traceSourceName={result?.traceSourceName ?? tracePanel.traceSourceName}
			logSourceName={result?.logSourceName ?? tracePanel.logSourceName}
		/>
	);
}

export function DataRowSidePanel({
	open,
	onOpenChange,
	identity,
	adapter,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	identity: RowIdentity | null;
	adapter: RowPanelAdapter | null;
}) {
	const query = useQuery({
		queryKey:
			identity && adapter
				? adapter.getQueryKey(identity)
				: ["data-row-side-panel", "idle"],
		queryFn: async () => {
			if (!identity || !adapter) {
				return { rows: [] };
			}
			return await adapter.fetchRow(identity);
		},
		enabled: open && identity != null && adapter != null,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const rows = query.data?.rows ?? [];
	const errorMessage =
		query.error && adapter?.formatError
			? adapter.formatError(query.error)
			: query.error instanceof Error
				? query.error.message
				: "Failed to load row details";
	const loadedRow = rows.length === 1 ? rows[0] : null;
	const tracePanel =
		loadedRow && adapter
			? (adapter.getTracePanel?.(loadedRow, adapter.resolveFields(loadedRow)) ??
				null)
			: null;

	const sheetResize = usePanelResize({
		direction: "left",
		defaultWidth: Math.floor(window.innerWidth * 0.7),
		minWidth: 400,
		maxWidth: Math.floor(window.innerWidth * 0.95),
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-[94vw] max-w-none flex-row gap-0 border-[color:var(--surface-border)] bg-[color:var(--surface-background)] p-0 sm:max-w-none"
				style={{ width: sheetResize.width }}
			>
				{/* Resize handle — left edge */}
				<div
					ref={sheetResize.handleRef}
					className={cn(
						"group/resize absolute inset-y-0 -left-1 z-20 flex w-2 cursor-col-resize items-center justify-center",
						sheetResize.isResizing && "bg-primary/10",
					)}
					title="Drag to resize (double-click to reset)"
				>
					<span
						className={cn(
							"flex h-8 w-4 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover/resize:opacity-100",
							sheetResize.isResizing && "opacity-100",
						)}
					>
						<GripVertical className="size-3 text-muted-foreground" />
					</span>
				</div>
				<SheetHeader className="sr-only">
					<SheetTitle>Row details</SheetTitle>
					<SheetDescription>Inspect selected row values.</SheetDescription>
				</SheetHeader>
				{tracePanel && identity && adapter ? (
					<TracePanelSlot
						identity={identity}
						adapter={adapter}
						tracePanel={tracePanel}
					/>
				) : null}
				<div className="flex min-w-0 flex-1 flex-col">
					{!identity || !adapter ? (
						<StateMessage
							title="No row selected"
							description="Select a table row to inspect details."
						/>
					) : query.isPending || query.isFetching ? (
						<div className="flex min-h-[18rem] items-center justify-center gap-2 text-muted-foreground text-sm">
							<Loader2 className="size-4 animate-spin" />
							Loading row details
						</div>
					) : query.error ? (
						<StateMessage
							title="Could not load row details"
							description={errorMessage}
							variant="danger"
						/>
					) : rows.length === 0 ? (
						<StateMessage
							title="No matching row"
							description="The selected row identity did not match any row in the source table."
						/>
					) : rows.length > 1 ? (
						<StateMessage
							title="Ambiguous row identity"
							description="The selected row identity matched more than one row. Add more identifying fields to the source or query before opening details."
							variant="danger"
						/>
					) : (
						<SuccessPanel row={rows[0]} identity={identity} adapter={adapter} />
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
