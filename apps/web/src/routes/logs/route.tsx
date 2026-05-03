import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	BarChart3,
	PanelLeft,
	Rows3,
	TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/web/components/ui/sheet";
import { useContentSidebar } from "@/web/hooks/use-content-sidebar";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { getLogSources } from "@/web/lib/sources";
import {
	createProxyClient,
	executeClickhouseJsonQuery,
	formatClickhouseQueryError,
} from "../integrations/-lib/clickhouse-client";
import { AnalysisModeNav } from "./-components/analysis-mode-nav";
import {
	type ClickhouseRow,
	DynamicResultsTable,
} from "./-components/dynamic-results-table";
import { LogsError } from "./-components/logs-error";
import { LogsSidebarPreview } from "./-components/logs-sidebar-preview";
import { LogsSkeleton } from "./-components/logs-skeleton";
import {
	LogsVolumeChart,
	type LogsVolumePoint,
} from "./-components/logs-volume-chart";
import type { AutoRefreshInterval } from "./-components/query-composer";
import { QueryComposer } from "./-components/query-composer";
import {
	buildLogsTableQuery,
	buildLogsVolumeQuery,
	getLogsQueryDefaults,
	type LogTimeRange,
} from "./-lib/logs-queries";

const logSourcesQueryOptions = queryOptions({
	queryKey: ["sources", "logs"],
	queryFn: getLogSources,
});

type LogsExecutionState = {
	rows: ClickhouseRow[];
	columns: Array<{ key: string; label: string }>;
	volumePoints: LogsVolumePoint[];
	rowsRead: number | null;
	elapsed: number | null;
	bytesRead: number | null;
};

export const Route = createFileRoute("/logs")({
	validateSearch: (search: Record<string, unknown>) => {
		const sourceId = search.sourceId;
		return {
			...(typeof sourceId === "string" && sourceId.trim()
				? { sourceId: sourceId.trim() }
				: {}),
		};
	},
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			authClient: opts.context.authClient,
			location: opts.location,
		});
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(logSourcesQueryOptions);
	},
	component: LogsRoute,
	pendingComponent: LogsSkeleton,
	errorComponent: LogsError,
});

function LogsRoute() {
	const navigate = useNavigate();
	const { data: logSources = [] } = useQuery(logSourcesQueryOptions);
	const { isExpanded: isAppSidebarExpanded } = useContentSidebar();
	const search = Route.useSearch();
	const [queryMode, setQueryMode] = useState<"sql" | "lucene">("sql");
	const [timeRange, setTimeRange] = useState<LogTimeRange>("15m");
	const [autoRefreshInterval, setAutoRefreshInterval] =
		useState<AutoRefreshInterval>("off");
	const [selectQuery, setSelectQuery] = useState("");
	const [whereQuery, setWhereQuery] = useState("");
	const [orderByQuery, setOrderByQuery] = useState("");
	const [isRunning, setIsRunning] = useState(false);
	const [execution, setExecution] = useState<LogsExecutionState>({
		rows: [],
		columns: [],
		volumePoints: [],
		rowsRead: null,
		elapsed: null,
		bytesRead: null,
	});
	const [runError, setRunError] = useState<string | null>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const previousSourceIdRef = useRef<string | null>(null);
	const timeRangeRef = useRef(timeRange);

	const selectedSource = useMemo(
		() => logSources.find((source) => source.id === search.sourceId) ?? null,
		[logSources, search.sourceId],
	);

	useEffect(() => {
		timeRangeRef.current = timeRange;
	}, [timeRange]);

	const runQueryForSource = async (
		source: typeof selectedSource,
		queryState: {
			selectQuery: string;
			whereQuery: string;
			orderByQuery: string;
			timeRange: LogTimeRange;
		},
	) => {
		if (!source) return;

		const tableQuery = buildLogsTableQuery(source, queryState);
		const volumeQuery = buildLogsVolumeQuery(source, queryState);
		if (!tableQuery || !volumeQuery) return;

		setIsRunning(true);
		setRunError(null);

		try {
			const client = createProxyClient(source.connectionId);
			const [tableResult, volumeResult] = await Promise.all([
				executeClickhouseJsonQuery<ClickhouseRow>(client, tableQuery),
				executeClickhouseJsonQuery<{ bucket: string; rows: number }>(
					client,
					volumeQuery,
				),
			]);

			setExecution({
				rows: tableResult.data,
				columns: tableResult.meta?.length
					? tableResult.meta.map((column) => ({
							key: column.name,
							label: column.name,
						}))
					: tableResult.data[0]
						? Object.keys(tableResult.data[0]).map((key) => ({
								key,
								label: key,
							}))
						: [],
				volumePoints: volumeResult.data.map((row) => ({
					bucket: row.bucket,
					rows: Number(row.rows ?? 0),
				})),
				rowsRead: tableResult.statistics?.rows_read ?? null,
				elapsed: tableResult.statistics?.elapsed ?? null,
				bytesRead: tableResult.statistics?.bytes_read ?? null,
			});
		} catch (error) {
			setRunError(formatClickhouseQueryError(error));
			setExecution({
				rows: [],
				columns: [],
				volumePoints: [],
				rowsRead: null,
				elapsed: null,
				bytesRead: null,
			});
		} finally {
			setIsRunning(false);
		}
	};

	useEffect(() => {
		if (logSources.length === 0) return;

		const nextSource =
			logSources.find((source) => source.id === search.sourceId) ??
			logSources[0];

		if (search.sourceId === nextSource.id) return;

		void navigate({
			to: "/logs",
			search: (prev) => ({ ...prev, sourceId: nextSource.id }),
			replace: true,
		});
	}, [logSources, navigate, search.sourceId]);

	useEffect(() => {
		if (!search.sourceId) return;

		const nextSource = logSources.find(
			(source) => source.id === search.sourceId,
		);
		if (!nextSource) return;

		if (previousSourceIdRef.current === nextSource.id) return;
		previousSourceIdRef.current = nextSource.id;

		const defaults = getLogsQueryDefaults(nextSource);
		setSelectQuery(defaults.selectQuery);
		setOrderByQuery(defaults.orderByQuery);
		setWhereQuery("");
		void runQueryForSource(nextSource, {
			selectQuery: defaults.selectQuery,
			whereQuery: "",
			orderByQuery: defaults.orderByQuery,
			timeRange: timeRangeRef.current,
		});
	}, [logSources, search.sourceId]);

	const canRun =
		Boolean(
			selectedSource?.config.database &&
				selectedSource.config.table &&
				selectedSource.config.timestampField &&
				selectQuery.trim() &&
				orderByQuery.trim(),
		) && !isRunning;

	const activeQueryState = useMemo(
		() => ({
			selectQuery,
			whereQuery,
			orderByQuery,
			timeRange,
		}),
		[orderByQuery, selectQuery, timeRange, whereQuery],
	);

	const runQuery = () => {
		if (!selectedSource || !canRun) return;
		void runQueryForSource(selectedSource, activeQueryState);
	};

	useEffect(() => {
		if (autoRefreshInterval === "off" || !selectedSource || !canRun) return;

		const intervalMs =
			autoRefreshInterval === "10s"
				? 10_000
				: autoRefreshInterval === "30s"
					? 30_000
					: 60_000;

		const intervalId = window.setInterval(() => {
			void runQueryForSource(selectedSource, {
				selectQuery,
				whereQuery,
				orderByQuery,
				timeRange,
			});
		}, intervalMs);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [
		autoRefreshInterval,
		canRun,
		orderByQuery,
		selectQuery,
		selectedSource,
		timeRange,
		whereQuery,
	]);

	const resultColumns = useMemo(() => {
		if (execution.columns.length > 0) {
			return execution.columns;
		}

		const fallbackColumns =
			execution.rows.length > 0 ? Object.keys(execution.rows[0]) : [];
		return fallbackColumns.map((key) => ({
			key,
			label: key,
		}));
	}, [execution.columns, execution.rows]);

	const summaryBadges = [
		{
			label: "Rows",
			value: execution.rows.length.toString(),
			note:
				execution.rowsRead != null
					? `${new Intl.NumberFormat("en-US").format(execution.rowsRead)} read`
					: "returned rows",
			icon: Rows3,
		},
		{
			label: "Elapsed",
			value:
				execution.elapsed != null ? `${execution.elapsed.toFixed(3)}s` : "—",
			icon: TimerReset,
		},
		{
			label: "Bytes read",
			value:
				execution.bytesRead != null
					? new Intl.NumberFormat("en-US", { notation: "compact" }).format(
							execution.bytesRead,
						)
					: "—",
			icon: BarChart3,
		},
	];

	return (
		<div className="flex flex-1 flex-col px-4 pt-20 pb-10 sm:px-6 lg:px-8 xl:px-0 xl:pt-13">
			<div className="w-full xl:pl-[280px]">
				<div className="mb-4 flex items-center justify-between rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-background)]/92 px-4 py-3 shadow-[var(--surface-shadow)] backdrop-blur-sm xl:hidden">
					<div>
						<div className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
							Log explorer
						</div>
						<h2 className="mt-1 text-lg leading-none">Sidebar controls</h2>
					</div>

					<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
						<SheetTrigger asChild>
							<Button
								variant="outline"
								className="border-[color:var(--surface-border)] bg-[color:var(--surface-background)]/80"
							>
								<PanelLeft className="size-4" />
								Open sidebar
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="w-[18.5rem] max-w-[88vw] gap-0 border-[color:var(--surface-border)] bg-[color:var(--surface-background)] p-0 sm:max-w-[18.5rem]"
						>
							<SheetHeader className="border-[color:var(--surface-border)] border-b px-4 py-4 text-left">
								<SheetTitle>Sidebar controls</SheetTitle>
								<SheetDescription>
									Browse presets, models, memory, and mode options.
								</SheetDescription>
							</SheetHeader>
							<LogsSidebarPreview className="min-h-0 flex-1" />
						</SheetContent>
					</Sheet>
				</div>

				<LogsSidebarPreview
					className={`fixed top-13 bottom-0 z-20 hidden w-[280px] border-[color:var(--surface-border)] border-r bg-[color:var(--surface-background)] shadow-[12px_0_32px_rgba(0,0,0,0.08)] xl:flex dark:shadow-[12px_0_32px_rgba(0,0,0,0.24)] ${isAppSidebarExpanded ? "left-48" : "left-12"}`}
				/>

				<div className="flex min-h-0 w-full flex-col gap-5">
					<QueryComposer
						className="w-full"
						mode={queryMode}
						timeRange={timeRange}
						autoRefreshInterval={autoRefreshInterval}
						selectQuery={selectQuery}
						whereQuery={whereQuery}
						orderByQuery={orderByQuery}
						onModeChange={setQueryMode}
						onSelectQueryChange={setSelectQuery}
						onWhereQueryChange={setWhereQuery}
						onOrderByQueryChange={setOrderByQuery}
						onTimeRangeChange={setTimeRange}
						onAutoRefreshIntervalChange={setAutoRefreshInterval}
						onRun={() => {
							runQuery();
						}}
						disabled={!canRun}
						isRunning={isRunning}
					/>

					<div className="px-0 xl:px-5">
						<section className="logs-surface mx-auto min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden backdrop-blur-sm">
							<div className="space-y-5 p-5 lg:p-6">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="space-y-2">
										<Badge
											variant="outline"
											className="w-fit border-primary/30 bg-primary/5 text-primary"
										>
											Log explorer
										</Badge>
										<h1 className="max-w-3xl text-3xl tracking-tight sm:text-4xl">
											Query logs, inspect volume, and read rows directly from
											ClickHouse.
										</h1>
									</div>
									<div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
										{summaryBadges.map((item) => {
											const Icon = item.icon;
											return (
												<div
													key={item.label}
													className="flex items-center gap-2 text-muted-foreground"
												>
													<Icon className="size-4" />
													<div className="leading-tight">
														<div className="text-xs uppercase tracking-[0.18em]">
															{item.label}
														</div>
														<div className="font-medium text-foreground">
															{item.value}
														</div>
													</div>
												</div>
											);
										})}
									</div>
								</div>

								{runError ? (
									<div className="rounded-md border border-stone-200 bg-destructive/5 p-4 text-destructive text-sm shadow-sm dark:border-stone-800">
										<div className="mb-1 flex items-center gap-2 font-medium">
											<AlertTriangle className="size-4" />
											ClickHouse error
										</div>
										<p className="leading-6">{runError}</p>
									</div>
								) : (
									<div className="logs-surface-divider pt-4 text-muted-foreground text-sm leading-7">
										`SELECT` and `ORDER BY` are reset when you switch sources in
										the header. Use `WHERE` to narrow the active time window.
									</div>
								)}
							</div>

							<div className="logs-surface-divider px-5 py-5 lg:px-6">
								<AnalysisModeNav />
								<div className="mt-5 space-y-5">
									<LogsVolumeChart points={execution.volumePoints} />

									<DynamicResultsTable
										rows={execution.rows}
										columns={resultColumns}
										emptyState={
											<div className="text-center">
												<p className="font-medium text-sm">
													{logSources.length === 0
														? "No log sources configured yet."
														: isRunning
															? "Running query..."
															: "No rows to show yet."}
												</p>
												<p className="mt-2 text-muted-foreground text-sm leading-6">
													{logSources.length === 0 ? (
														<>
															Create a log source first and then come back to{" "}
															<Link
																to="/integrations/sources"
																className="text-primary underline-offset-4 hover:underline"
															>
																Integrations / Sources
															</Link>
															.
														</>
													) : (
														"Click refresh to execute the active query against ClickHouse."
													)}
												</p>
											</div>
										}
									/>
								</div>
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
