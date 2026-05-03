import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, PanelLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
	type ClickhouseJsonResult,
	createProxyClient,
	executeClickhouseJsonQuery,
	formatClickhouseQueryError,
} from "../integrations/-lib/clickhouse-client";
import { DynamicResultsTable } from "./-components/dynamic-results-table";
import { LogsError } from "./-components/logs-error";
import { LogsSidebarPreview } from "./-components/logs-sidebar-preview";
import { LogsSkeleton } from "./-components/logs-skeleton";
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
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [tableResult, setTableResult] = useState<ClickhouseJsonResult | null>(
		null,
	);
	const [queryError, setQueryError] = useState<string | null>(null);
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
		setQueryError(null);

		try {
			const client = createProxyClient(source.connectionId);
			const [nextTableResult] = await Promise.all([
				executeClickhouseJsonQuery(client, tableQuery),
				executeClickhouseJsonQuery(client, volumeQuery),
			]);
			setTableResult(nextTableResult);
		} catch (error) {
			setTableResult(null);
			setQueryError(formatClickhouseQueryError(error));
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

	const tableColumns = useMemo(() => {
		if (tableResult?.meta?.length) {
			return tableResult.meta.map((column) => ({
				key: column.name,
				label: column.name,
			}));
		}

		const firstRow = tableResult?.data[0];
		if (!firstRow) return [];

		return Object.keys(firstRow).map((key) => ({
			key,
			label: key,
		}));
	}, [tableResult]);

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

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-[color:var(--surface-background)] px-4 pt-20 pb-0 sm:px-6 lg:px-8 xl:px-0 xl:pt-13">
			<div className="flex min-h-0 w-full flex-1 flex-col xl:pl-[280px]">
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

				<div className="flex min-h-0 w-full flex-1 flex-col gap-0 bg-[color:var(--surface-background)]">
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

					<section className="flex min-h-0 w-full flex-1 flex-col bg-[color:var(--surface-background)]">
						{queryError ? (
							<div className="flex h-full min-h-[20rem] items-start justify-center bg-[color:var(--surface-background)] px-4 py-6 sm:px-6">
								<div className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive shadow-[var(--surface-shadow)]">
									<div className="flex items-center gap-2 font-medium text-sm">
										<AlertTriangle className="size-4 shrink-0" />
										<span>ClickHouse query failed</span>
									</div>
									<p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-6">
										{queryError}
									</p>
								</div>
							</div>
						) : (
							<DynamicResultsTable
								className="flex-1"
								rows={tableResult?.data ?? []}
								columns={tableColumns}
								statistics={tableResult?.statistics}
								emptyState={
									<div className="flex h-full min-h-[18rem] items-center justify-center text-muted-foreground text-sm">
										Run a query to fill this space with log rows.
									</div>
								}
							/>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}
