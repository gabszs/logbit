import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	DataRowSidePanel,
	type RowIdentity,
} from "@/web/components/data-row-side-panel";
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
import { useLogsCanvasSidebar } from "@/web/hooks/use-logs-canvas-sidebar";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { SourceType } from "@/web/lib/source-types";
import {
	getSourcesForSourceSelect,
	isLogSource,
	type SourceEntity,
} from "@/web/lib/sources";
import {
	type ClickhouseJsonResult,
	createProxyClient,
	executeClickhouseJsonQuery,
	formatClickhouseQueryError,
} from "../../lib/clickhouse-client";
import { DynamicResultsTable } from "./-components/dynamic-results-table";
import { LogsError } from "./-components/logs-error";
import { LogsPatternsTable } from "./-components/logs-patterns-table";
import { LogsSidebarPreview } from "./-components/logs-sidebar-preview";
import { LogsSkeleton } from "./-components/logs-skeleton";
import {
	type LogsVolumeActivePopover,
	LogsVolumeChart,
} from "./-components/logs-volume-chart";
import type { AutoRefreshInterval } from "./-components/query-composer";
import { QueryComposer } from "./-components/query-composer";
import {
	applyDynamicFacetFilters,
	buildDistinctJsonPathsQuery,
	buildDynamicFacetSidecarQuery,
	buildFacetFieldsFromMetadata,
	buildFacetViewGroups,
	buildJsonKeysQuery,
	buildMetadataQuery,
	type ClickhouseColumnMeta,
	type DynamicFacetField,
	type DynamicFacetMode,
	type DynamicFacetRow,
	type DynamicFacetState,
	hasDynamicFacetState,
	normalizeFacetRows,
	toggleDynamicFacetValue,
} from "./-lib/logs-facets";
import {
	computeLogsPatternGroups,
	type LogsResultsView,
} from "./-lib/logs-patterns";
import {
	buildLogsChartDrilldownClauses,
	buildLogsTableQuery,
	buildLogsVolumeQuery,
	getLogsQueryDefaults,
	type LogsChartDrilldown,
	type LogsQueryAbsoluteTimeRange,
	type LogsVolumeChartData,
	type LogsVolumePoint,
	type LogsVolumeRow,
	type LogTimeRange,
	normalizeLogsVolumeRows,
	resolveLogsQueryTimeBounds,
} from "./-lib/logs-queries";
import {
	buildLogsRowIdentity,
	createLogsRowPanelAdapter,
	getLogsRowSelectorAliases,
	getLogsRowSelectorSelects,
} from "./-lib/logs-row-panel";

const allSourcesQueryOptions = queryOptions({
	queryKey: ["sources", "all"],
	queryFn: getSourcesForSourceSelect,
});

const LOGS_VOLUME_MAX_X_AXIS_TICKS = 7;
const LOGS_VOLUME_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

const LOGS_VOLUME_TOOLTIP_FORMATTER = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

function getDateTimePart(
	parts: Intl.DateTimeFormatPart[],
	type: Intl.DateTimeFormatPartTypes,
) {
	return parts.find((part) => part.type === type)?.value ?? "00";
}

function formatLogsVolumeTimeLabel(date: Date) {
	const parts = LOGS_VOLUME_TIME_FORMATTER.formatToParts(date);
	return `${getDateTimePart(parts, "hour")}:${getDateTimePart(parts, "minute")}`;
}

function formatLogsVolumeTooltipLabel(date: Date) {
	const parts = LOGS_VOLUME_TOOLTIP_FORMATTER.formatToParts(date);
	return [
		`${getDateTimePart(parts, "year")}-${getDateTimePart(parts, "month")}-${getDateTimePart(parts, "day")}`,
		`${getDateTimePart(parts, "hour")}:${getDateTimePart(parts, "minute")}:${getDateTimePart(parts, "second")}`,
	].join(" ");
}

function isValidDate(date: Date | null): date is Date {
	return date != null && !Number.isNaN(date.getTime());
}

function applyLogsVolumeXAxisLabels({
	chartData,
	timeBounds,
	formatLabel,
	maxTickCount,
}: {
	chartData: LogsVolumeChartData;
	timeBounds: LogsQueryAbsoluteTimeRange | null;
	formatLabel: (date: Date) => string;
	maxTickCount: number;
}): LogsVolumeChartData {
	const { points } = chartData;
	if (points.length === 0) {
		return {
			...chartData,
			xAxisTicks: [],
		};
	}

	const tickCount = Math.max(1, Math.min(maxTickCount, points.length));
	const tickIndexes = new Set<number>();
	if (tickCount === 1) {
		tickIndexes.add(0);
	} else {
		for (let index = 0; index < tickCount; index++) {
			tickIndexes.add(
				Math.round((index * (points.length - 1)) / (tickCount - 1)),
			);
		}
	}

	const boundsStart = timeBounds ? new Date(timeBounds.startIso) : null;
	const boundsEnd = timeBounds ? new Date(timeBounds.endIso) : null;
	const firstPointIndex = 0;
	const lastPointIndex = points.length - 1;
	const xAxisTicks: string[] = [];
	const labeledPoints: LogsVolumePoint[] = points.map((point, index) => {
		if (!tickIndexes.has(index)) {
			return point;
		}

		const labelDate =
			index === firstPointIndex && isValidDate(boundsStart)
				? boundsStart
				: index === lastPointIndex && isValidDate(boundsEnd)
					? boundsEnd
					: new Date(point.bucketStart);

		xAxisTicks.push(point.bucketStart);
		return {
			...point,
			xAxisLabel: formatLabel(labelDate),
		};
	});

	return {
		...chartData,
		points: labeledPoints,
		xAxisTicks,
	};
}

export const Route = createFileRoute("/logs")({
	validateSearch: (search: Record<string, unknown>) => {
		const sourceId = search.sourceId;
		const view = search.view;
		const levels = Array.isArray(search.levels)
			? search.levels.filter((item): item is string => typeof item === "string")
			: typeof search.levels === "string"
				? [search.levels]
				: [];
		return {
			...(typeof sourceId === "string" && sourceId.trim()
				? { sourceId: sourceId.trim() }
				: {}),
			...(view === "table" || view === "groups" ? { view } : {}),
			...(search.denoise === true || search.denoise === "true"
				? { denoise: true }
				: {}),
			...(levels.length ? { levels } : {}),
			...(search.showLevelDist === true || search.showLevelDist === "true"
				? { showLevelDist: true }
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
		await context.queryClient.ensureQueryData(allSourcesQueryOptions);
	},
	component: LogsRoute,
	pendingComponent: LogsSkeleton,
	errorComponent: LogsError,
});

function LogsRoute() {
	const navigate = useNavigate();
	const { data: allSources = [] } = useQuery(allSourcesQueryOptions);
	const { isExpanded: isAppSidebarExpanded } = useContentSidebar();
	const { isExpanded: isLogsCanvasSidebarExpanded } = useLogsCanvasSidebar();
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
	const [volumeResult, setVolumeResult] =
		useState<ClickhouseJsonResult<LogsVolumeRow> | null>(null);
	const [volumeTimeBounds, setVolumeTimeBounds] =
		useState<LogsQueryAbsoluteTimeRange | null>(null);
	const [volumeTimeRange, setVolumeTimeRange] =
		useState<LogTimeRange>(timeRange);
	const [queryError, setQueryError] = useState<string | null>(null);
	const [volumeError, setVolumeError] = useState<string | null>(null);
	const [isDenoisePanelVisible, setIsDenoisePanelVisible] = useState(true);
	const [chartDrilldown, setChartDrilldown] =
		useState<LogsChartDrilldown | null>(null);
	const [activeChartPopover, setActiveChartPopover] =
		useState<LogsVolumeActivePopover | null>(null);
	const [selectedRowIdentity, setSelectedRowIdentity] =
		useState<RowIdentity | null>(null);
	const [selectedRowIdentityVersion, setSelectedRowIdentityVersion] =
		useState(0);
	const [dynamicFacetState, setDynamicFacetState] = useState<DynamicFacetState>(
		{},
	);
	const [dynamicFacetFields, setDynamicFacetFields] = useState<
		DynamicFacetField[]
	>([]);
	const [dynamicFacetRows, setDynamicFacetRows] = useState<DynamicFacetRow[]>(
		[],
	);
	const [isDynamicFacetsLoading, setIsDynamicFacetsLoading] = useState(false);
	const [dynamicFacetsError, setDynamicFacetsError] = useState<string | null>(
		null,
	);
	const [isRootSpansOnly, setIsRootSpansOnly] = useState(false);
	const previousSourceIdRef = useRef<string | null>(null);
	const timeRangeRef = useRef(timeRange);
	const resultsView: LogsResultsView =
		search.view === "groups" ? "groups" : "table";
	const selectedLevels = useMemo(() => search.levels ?? [], [search.levels]);

	const selectedSource = useMemo(
		() => allSources.find((source) => source.id === search.sourceId) ?? null,
		[allSources, search.sourceId],
	);
	const rowPanelAdapter = useMemo(
		() =>
			selectedSource && isLogSource(selectedSource)
				? createLogsRowPanelAdapter(selectedSource, allSources)
				: null,
		[allSources, selectedSource],
	);
	const hiddenRowSelectorAliases = useMemo(
		() =>
			selectedSource && isLogSource(selectedSource)
				? getLogsRowSelectorAliases(selectedSource)
				: [],
		[selectedSource],
	);

	useEffect(() => {
		timeRangeRef.current = timeRange;
	}, [timeRange]);

	type ActiveLogsQueryState = {
		selectQuery: string;
		whereQuery: string;
		orderByQuery: string;
		timeRange: LogTimeRange;
	};

	const buildDrilldownOptions = useCallback(
		(
			source: NonNullable<typeof selectedSource>,
			drilldown: LogsChartDrilldown | null,
		) => {
			const additionalWhereClauses = buildLogsChartDrilldownClauses(
				source,
				drilldown,
			);
			const absoluteTimeRange: LogsQueryAbsoluteTimeRange | undefined =
				drilldown
					? {
							startIso: drilldown.bucketStart,
							endIso: drilldown.bucketEnd,
						}
					: undefined;

			return {
				additionalWhereClauses,
				absoluteTimeRange,
			};
		},
		[],
	);

	const loadDynamicFacets = useCallback(
		async ({
			source,
			queryState,
			drilldownOptions,
			now,
		}: {
			source: SourceEntity;
			queryState: ActiveLogsQueryState;
			drilldownOptions: {
				additionalWhereClauses: string[];
				absoluteTimeRange?: LogsQueryAbsoluteTimeRange;
			};
			now: Date;
		}) => {
			setIsDynamicFacetsLoading(true);
			setDynamicFacetsError(null);
			setDynamicFacetFields([]);
			setDynamicFacetRows([]);
			setDynamicFacetState({});

			try {
				const client = createProxyClient(source.connectionId);
				const facetQueryState = {
					whereQuery: queryState.whereQuery,
					orderByQuery: queryState.orderByQuery,
					timeRange: queryState.timeRange,
					now,
					...drilldownOptions,
				};
				const metadata = await executeClickhouseJsonQuery<ClickhouseColumnMeta>(
					client,
					buildMetadataQuery(source),
				);
				const firstPass = buildFacetFieldsFromMetadata(metadata.data, {});
				const jsonKeyEntries = await Promise.all(
					firstPass.jsonKeyColumns.map(async ({ jsonColumn, keyColumn }) => {
						const result = await executeClickhouseJsonQuery<{
							keys?: string[];
						}>(client, buildJsonKeysQuery(source, keyColumn, facetQueryState));
						return [jsonColumn, result.data[0]?.keys ?? []] as const;
					}),
				);
				const jsonPathEntries = await Promise.all(
					firstPass.jsonColumnsWithoutKeyColumns.map(async (jsonColumn) => {
						const result = await executeClickhouseJsonQuery<{
							keys?: string[];
						}>(
							client,
							buildDistinctJsonPathsQuery(source, jsonColumn, facetQueryState),
						);
						return [jsonColumn, result.data[0]?.keys ?? []] as const;
					}),
				);
				const jsonKeys = Object.fromEntries([
					...jsonKeyEntries,
					...jsonPathEntries,
				]);
				const { fields } = buildFacetFieldsFromMetadata(
					metadata.data,
					jsonKeys,
				);
				const sidecarQuery = buildDynamicFacetSidecarQuery(
					source,
					fields,
					facetQueryState,
				);
				if (!sidecarQuery) {
					setDynamicFacetFields(fields);
					setDynamicFacetRows([]);
					return;
				}
				const sidecar = await executeClickhouseJsonQuery<
					Record<string, unknown>
				>(client, sidecarQuery);
				setDynamicFacetFields(fields);
				setDynamicFacetRows(normalizeFacetRows(sidecar.data, fields));
			} catch (error) {
				setDynamicFacetsError(formatClickhouseQueryError(error));
			} finally {
				setIsDynamicFacetsLoading(false);
			}
		},
		[],
	);

	const runQueryForSource = useCallback(
		async (
			source: typeof selectedSource,
			queryState: ActiveLogsQueryState,
			drilldown: LogsChartDrilldown | null,
		) => {
			if (!source) return;

			const drilldownOptions = buildDrilldownOptions(source, drilldown);
			const queryNow = new Date();
			const queryTimeBounds = resolveLogsQueryTimeBounds(queryState.timeRange, {
				now: queryNow,
				absoluteTimeRange: drilldownOptions.absoluteTimeRange,
			});
			const tableQuery = buildLogsTableQuery(source, {
				...queryState,
				now: queryNow,
				...drilldownOptions,
				extraSelectExpressions: isLogSource(source)
					? getLogsRowSelectorSelects(source)
					: [],
			});
			if (!tableQuery) {
				return;
			}

			const volumeQuery = buildLogsVolumeQuery(source, {
				whereQuery: queryState.whereQuery,
				timeRange: queryState.timeRange,
				now: queryNow,
				...drilldownOptions,
			});

			setIsRunning(true);
			setQueryError(null);
			setVolumeError(null);
			setVolumeTimeBounds(queryTimeBounds);
			setVolumeTimeRange(queryState.timeRange);
			setActiveChartPopover(null);
			setDynamicFacetFields([]);
			setDynamicFacetRows([]);
			setDynamicFacetState({});
			setDynamicFacetsError(null);

			try {
				const client = createProxyClient(source.connectionId);
				const [tableOutcome, volumeOutcome] = await Promise.allSettled([
					executeClickhouseJsonQuery(client, tableQuery),
					volumeQuery
						? executeClickhouseJsonQuery<LogsVolumeRow>(client, volumeQuery)
						: Promise.resolve(null),
				]);

				if (tableOutcome.status === "fulfilled") {
					setTableResult(tableOutcome.value);
					setQueryError(null);
					void loadDynamicFacets({
						source,
						queryState,
						drilldownOptions,
						now: queryNow,
					});
				} else {
					setTableResult(null);
					setQueryError(formatClickhouseQueryError(tableOutcome.reason));
					setIsDynamicFacetsLoading(false);
				}

				if (volumeOutcome.status === "fulfilled") {
					setVolumeResult(volumeOutcome.value);
					setVolumeError(null);
				} else {
					setVolumeResult(null);
					setVolumeError(formatClickhouseQueryError(volumeOutcome.reason));
				}
			} finally {
				setIsRunning(false);
			}
		},
		[buildDrilldownOptions, loadDynamicFacets],
	);

	useEffect(() => {
		if (allSources.length === 0) return;

		const nextSource =
			allSources.find((source) => source.id === search.sourceId) ??
			allSources[0];

		if (search.sourceId === nextSource.id) return;

		void navigate({
			to: "/logs",
			search: (prev) => ({ ...prev, sourceId: nextSource.id }),
			replace: true,
		});
	}, [allSources, navigate, search.sourceId]);

	useEffect(() => {
		if (!search.sourceId) return;

		const nextSource = allSources.find(
			(source) => source.id === search.sourceId,
		);
		if (!nextSource) return;

		if (previousSourceIdRef.current === nextSource.id) return;
		previousSourceIdRef.current = nextSource.id;

		const defaults = getLogsQueryDefaults(nextSource);
		setChartDrilldown(null);
		setActiveChartPopover(null);
		setTableResult(null);
		setVolumeResult(null);
		setVolumeTimeBounds(null);
		setVolumeTimeRange(timeRangeRef.current);
		setQueryError(null);
		setVolumeError(null);
		setSelectedRowIdentity(null);
		setSelectedRowIdentityVersion(0);
		setDynamicFacetState({});
		setDynamicFacetFields([]);
		setDynamicFacetRows([]);
		setDynamicFacetsError(null);
		setIsRootSpansOnly(false);
		setSelectQuery(defaults.selectQuery);
		setOrderByQuery(defaults.orderByQuery);
		setWhereQuery("");
		void runQueryForSource(
			nextSource,
			{
				selectQuery: defaults.selectQuery,
				whereQuery: "",
				orderByQuery: defaults.orderByQuery,
				timeRange: timeRangeRef.current,
			},
			null,
		);
	}, [allSources, runQueryForSource, search.sourceId]);

	const canRun =
		Boolean(
			selectedSource?.config.database &&
				selectedSource.config.table &&
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

	const buildQueryStateWithLevelFilters = useCallback(
		(
			source: NonNullable<typeof selectedSource>,
			queryState: ActiveLogsQueryState,
		) => {
			let finalWhereQuery = queryState.whereQuery;

			if (isLogSource(source) && selectedLevels.length > 0) {
				const severityField =
					source.config.severityField?.trim() || "SeverityText";
				const normalLevels = selectedLevels.filter(
					(level) => level !== "UNKNOWN",
				);
				const hasUnknown = selectedLevels.includes("UNKNOWN");
				const conditions: string[] = [];

				if (normalLevels.length > 0) {
					const lowerLevels = normalLevels
						.map((level) => `'${level.toLowerCase()}'`)
						.join(", ");
					conditions.push(`lower(${severityField}) IN (${lowerLevels})`);
				}

				if (hasUnknown) {
					conditions.push(
						`(${severityField} IS NULL OR ${severityField} = '')`,
					);
				}

				const levelCondition =
					conditions.length > 1
						? `(${conditions.join(" OR ")})`
						: conditions[0];

				if (levelCondition) {
					finalWhereQuery = finalWhereQuery.trim()
						? `(${finalWhereQuery}) AND ${levelCondition}`
						: levelCondition;
				}
			}

			return {
				...queryState,
				whereQuery: finalWhereQuery,
			};
		},
		[selectedLevels],
	);

	const hasSeverityField = Boolean(
		selectedSource &&
			isLogSource(selectedSource) &&
			selectedSource.config.severityField?.trim(),
	);
	const volumeData = useMemo(() => {
		const normalizedVolumeData = normalizeLogsVolumeRows(
			volumeResult?.data ?? [],
			volumeTimeRange,
			hasSeverityField,
			{
				timeBounds: volumeTimeBounds,
				formatBucketLabel: formatLogsVolumeTooltipLabel,
			},
		);

		return applyLogsVolumeXAxisLabels({
			chartData: normalizedVolumeData,
			timeBounds: volumeTimeBounds,
			formatLabel: formatLogsVolumeTimeLabel,
			maxTickCount: LOGS_VOLUME_MAX_X_AXIS_TICKS,
		});
	}, [hasSeverityField, volumeResult?.data, volumeTimeBounds, volumeTimeRange]);

	const baseRows = tableResult?.data ?? [];
	const levelKey = useMemo(() => {
		if (!baseRows.length) return null;
		const keys = Object.keys(baseRows[0]);
		const configuredKey =
			selectedSource && isLogSource(selectedSource)
				? selectedSource.config.severityField?.trim().toLowerCase()
				: undefined;
		if (configuredKey) {
			const found = keys.find(
				(k) =>
					k.toLowerCase() === configuredKey ||
					k.toLowerCase().includes(configuredKey),
			);
			if (found) return found;
		}
		const candidates = [
			"level",
			"Level",
			"severity",
			"SeverityText",
			"severityText",
		];
		for (const cand of candidates) {
			const found = keys.find((k) => k.toLowerCase() === cand.toLowerCase());
			if (found) return found;
		}
		return null;
	}, [baseRows, selectedSource]);

	const { levelFilteredRows, levelFilteredFacetRows, levelDistribution } =
		useMemo(() => {
			const distribution = new Map<string, number>();
			let totalWithLevel = 0;

			const normalizedRows = baseRows.map((row, index) => {
				let level = null;
				if (levelKey) {
					const raw = row[levelKey];
					if (typeof raw === "string" && raw.trim()) {
						level = raw.trim().toUpperCase();
						if (level === "WARNING") level = "WARN";
					}
				}
				if (!level) {
					level = "UNKNOWN";
				}

				distribution.set(level, (distribution.get(level) || 0) + 1);
				totalWithLevel++;

				return { row, level, facetRow: dynamicFacetRows[index] };
			});

			const filteredEntries =
				selectedSource &&
				isLogSource(selectedSource) &&
				selectedLevels.length > 0
					? normalizedRows.filter(
							(nr) => nr.level && selectedLevels.includes(nr.level),
						)
					: normalizedRows;

			return {
				levelFilteredRows: filteredEntries.map((entry) => entry.row),
				levelFilteredFacetRows: filteredEntries.map(
					(entry) => entry.facetRow ?? { values: {} },
				),
				levelDistribution: { counts: distribution, total: totalWithLevel },
			};
		}, [baseRows, dynamicFacetRows, levelKey, selectedLevels, selectedSource]);
	const dynamicFacetFilteredEntries = useMemo(
		() =>
			applyDynamicFacetFilters(
				levelFilteredRows.map((row, index) => ({
					row,
					facetRow: levelFilteredFacetRows[index],
				})),
				levelFilteredFacetRows,
				dynamicFacetState,
			),
		[dynamicFacetState, levelFilteredFacetRows, levelFilteredRows],
	);
	const dynamicFacetFilteredRows = useMemo(
		() => dynamicFacetFilteredEntries.map((entry) => entry.row),
		[dynamicFacetFilteredEntries],
	);
	const dynamicFacetFilteredFacetRows = useMemo(
		() =>
			dynamicFacetFilteredEntries.map(
				(entry) => entry.facetRow ?? { values: {} },
			),
		[dynamicFacetFilteredEntries],
	);
	const dynamicFacetViewGroups = useMemo(
		() =>
			buildFacetViewGroups(
				dynamicFacetFields,
				hasDynamicFacetState(dynamicFacetState)
					? dynamicFacetFilteredFacetRows
					: levelFilteredFacetRows,
				dynamicFacetState,
			),
		[
			dynamicFacetFields,
			dynamicFacetFilteredFacetRows,
			dynamicFacetState,
			levelFilteredFacetRows,
		],
	);
	const patternsResult = useMemo(
		() =>
			computeLogsPatternGroups({
				rows: dynamicFacetFilteredRows,
				source:
					selectedSource && isLogSource(selectedSource) ? selectedSource : null,
				timeRange,
			}),
		[selectedSource, dynamicFacetFilteredRows, timeRange],
	);

	const { denoisedRows, noisyGroups } = useMemo(() => {
		if (!search.denoise || !patternsResult.groups.length) {
			return { denoisedRows: dynamicFacetFilteredRows, noisyGroups: [] };
		}

		const threshold = dynamicFacetFilteredRows.length * 0.1;
		const noisy = patternsResult.groups.filter((g) => g.count > threshold);
		if (noisy.length === 0) {
			return { denoisedRows: dynamicFacetFilteredRows, noisyGroups: [] };
		}

		const noisyRowsSet = new Set(noisy.flatMap((g) => g.samples));
		const filteredRows = dynamicFacetFilteredRows.filter(
			(row) => !noisyRowsSet.has(row),
		);

		return { denoisedRows: filteredRows, noisyGroups: noisy };
	}, [search.denoise, dynamicFacetFilteredRows, patternsResult.groups]);

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

	const generatedTableSql = useMemo(() => {
		if (!selectedSource) return null;

		const queryState = buildQueryStateWithLevelFilters(
			selectedSource,
			activeQueryState,
		);
		const drilldownOptions = buildDrilldownOptions(
			selectedSource,
			chartDrilldown,
		);

		return buildLogsTableQuery(selectedSource, {
			...queryState,
			...drilldownOptions,
			extraSelectExpressions: isLogSource(selectedSource)
				? getLogsRowSelectorSelects(selectedSource)
				: [],
		});
	}, [
		activeQueryState,
		buildDrilldownOptions,
		buildQueryStateWithLevelFilters,
		chartDrilldown,
		selectedSource,
	]);

	const runQuery = () => {
		if (!selectedSource || !canRun) return;

		void runQueryForSource(
			selectedSource,
			buildQueryStateWithLevelFilters(selectedSource, activeQueryState),
			chartDrilldown,
		);
	};

	const getRowKey = useCallback(
		(row: Record<string, unknown>) => {
			if (!selectedSource || !isLogSource(selectedSource)) return null;
			return buildLogsRowIdentity(selectedSource, row)?.selectedRowKey ?? null;
		},
		[selectedSource],
	);

	const handleRowClick = useCallback(
		(row: Record<string, unknown>) => {
			if (!selectedSource || !isLogSource(selectedSource)) return;
			const identity = buildLogsRowIdentity(selectedSource, row);
			if (identity) {
				setSelectedRowIdentity(identity);
				setSelectedRowIdentityVersion((current) => current + 1);
			}
		},
		[selectedSource],
	);

	const handleSelectedRowIdentityChange = useCallback(
		(identity: RowIdentity) => {
			setSelectedRowIdentity(identity);
			setSelectedRowIdentityVersion((current) => current + 1);
		},
		[],
	);

	const handleResultsViewChange = useCallback(
		(view: LogsResultsView) => {
			void navigate({
				to: "/logs",
				search: (prev) => ({ ...prev, view }),
				replace: true,
			});
		},
		[navigate],
	);

	const handleFilterToggle = useCallback(
		(filter: string) => {
			if (filter === "denoise") {
				void navigate({
					to: "/logs",
					search: (prev) => ({ ...prev, denoise: !prev.denoise }),
					replace: true,
				});
			}
		},
		[navigate],
	);

	const handleLevelToggle = useCallback(
		(level: string) => {
			void navigate({
				to: "/logs",
				search: (prev) => {
					const currentLevels = prev.levels || [];
					const newLevels = currentLevels.includes(level)
						? currentLevels.filter((l) => l !== level)
						: [...currentLevels, level];
					return { ...prev, levels: newLevels };
				},
				replace: true,
			});
		},
		[navigate],
	);

	const handleClearLevels = useCallback(() => {
		void navigate({
			to: "/logs",
			search: (prev) => ({ ...prev, levels: [] }),
			replace: true,
		});
	}, [navigate]);

	const handleClearAllFilters = useCallback(() => {
		setDynamicFacetState({});
		setIsRootSpansOnly(false);
		void navigate({
			to: "/logs",
			search: (prev) => ({ ...prev, denoise: false, levels: [] }),
			replace: true,
		});
	}, [navigate]);

	const handleDynamicFacetToggle = useCallback(
		(fieldId: string, value: string, mode: DynamicFacetMode) => {
			setDynamicFacetState((current) =>
				toggleDynamicFacetValue(current, fieldId, value, mode),
			);
		},
		[],
	);

	const handleDynamicFacetClear = useCallback((fieldId: string) => {
		setDynamicFacetState((current) => {
			const next = { ...current };
			delete next[fieldId];
			return next;
		});
	}, []);

	const handleToggleLevelDist = useCallback(() => {
		void navigate({
			to: "/logs",
			search: (prev) => ({ ...prev, showLevelDist: !prev.showLevelDist }),
			replace: true,
		});
	}, [navigate]);

	const clearChartDrilldown = useCallback(() => {
		if (!selectedSource) return;
		setChartDrilldown(null);
		setActiveChartPopover(null);
		void runQueryForSource(
			selectedSource,
			buildQueryStateWithLevelFilters(selectedSource, activeQueryState),
			null,
		);
	}, [
		activeQueryState,
		buildQueryStateWithLevelFilters,
		runQueryForSource,
		selectedSource,
	]);

	const applyChartDrilldown = useCallback(
		(drilldown: LogsChartDrilldown) => {
			if (!selectedSource) return;
			setChartDrilldown(drilldown);
			void runQueryForSource(
				selectedSource,
				buildQueryStateWithLevelFilters(selectedSource, activeQueryState),
				drilldown,
			);
		},
		[
			activeQueryState,
			buildQueryStateWithLevelFilters,
			runQueryForSource,
			selectedSource,
		],
	);

	useEffect(() => {
		if (autoRefreshInterval === "off" || !selectedSource || !canRun) return;

		const intervalMs =
			autoRefreshInterval === "10s"
				? 10_000
				: autoRefreshInterval === "30s"
					? 30_000
					: 60_000;

		const intervalId = window.setInterval(() => {
			const queryState = buildQueryStateWithLevelFilters(selectedSource, {
				selectQuery,
				whereQuery,
				orderByQuery,
				timeRange,
			});
			void runQueryForSource(selectedSource, queryState, chartDrilldown);
		}, intervalMs);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [
		autoRefreshInterval,
		buildQueryStateWithLevelFilters,
		canRun,
		orderByQuery,
		selectQuery,
		selectedSource,
		timeRange,
		whereQuery,
		chartDrilldown,
		runQueryForSource,
	]);

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-[color:var(--surface-background)] px-4 pt-20 pb-0 sm:px-6 lg:px-8 xl:px-0 xl:pt-13">
			<DataRowSidePanel
				open={selectedRowIdentity != null}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedRowIdentity(null);
					}
				}}
				identity={selectedRowIdentity}
				identityVersion={selectedRowIdentityVersion}
				adapter={rowPanelAdapter}
				onIdentityChange={handleSelectedRowIdentityChange}
			/>
			<div
				className={`flex min-h-0 w-full flex-1 flex-col transition-[padding-left] duration-200 ease-linear ${isLogsCanvasSidebarExpanded ? "xl:pl-[280px]" : "xl:pl-0"}`}
			>
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
							className="w-[18.5rem] max-w-[88vw] gap-0 border-[color:var(--surface-border)] bg-background p-0 sm:max-w-[18.5rem]"
						>
							<SheetHeader className="border-[color:var(--surface-border)] border-b px-4 py-4 text-left">
								<SheetTitle>Sidebar controls</SheetTitle>
								<SheetDescription>
									Browse presets, models, memory, and mode options.
								</SheetDescription>
							</SheetHeader>
							<LogsSidebarPreview
								className="min-h-0 flex-1"
								sourceType={
									selectedSource?.type === SourceType.Trace
										? SourceType.Trace
										: SourceType.Log
								}
								value={resultsView}
								activeFilters={search.denoise ? ["denoise"] : []}
								isDenoisePanelVisible={isDenoisePanelVisible}
								isRootSpansOnly={isRootSpansOnly}
								selectedLevels={selectedLevels}
								levelDistribution={levelDistribution}
								showLevelDist={search.showLevelDist}
								dynamicFacetGroups={dynamicFacetViewGroups}
								hasDynamicFacetFilters={hasDynamicFacetState(dynamicFacetState)}
								isDynamicFacetsLoading={isDynamicFacetsLoading}
								dynamicFacetsError={dynamicFacetsError}
								onValueChange={handleResultsViewChange}
								onFilterToggle={handleFilterToggle}
								onToggleDenoisePanel={() =>
									setIsDenoisePanelVisible(!isDenoisePanelVisible)
								}
								onToggleRootSpansOnly={() =>
									setIsRootSpansOnly((current) => !current)
								}
								onLevelToggle={handleLevelToggle}
								onClearLevels={handleClearLevels}
								onClearAllFilters={handleClearAllFilters}
								onToggleLevelDist={handleToggleLevelDist}
								onDynamicFacetToggle={handleDynamicFacetToggle}
								onDynamicFacetClear={handleDynamicFacetClear}
							/>
						</SheetContent>
					</Sheet>
				</div>

				{isLogsCanvasSidebarExpanded && (
					<LogsSidebarPreview
						sourceType={
							selectedSource?.type === SourceType.Trace
								? SourceType.Trace
								: SourceType.Log
						}
						value={resultsView}
						activeFilters={search.denoise ? ["denoise"] : []}
						isDenoisePanelVisible={isDenoisePanelVisible}
						isRootSpansOnly={isRootSpansOnly}
						selectedLevels={selectedLevels}
						levelDistribution={levelDistribution}
						showLevelDist={search.showLevelDist}
						dynamicFacetGroups={dynamicFacetViewGroups}
						hasDynamicFacetFilters={hasDynamicFacetState(dynamicFacetState)}
						isDynamicFacetsLoading={isDynamicFacetsLoading}
						dynamicFacetsError={dynamicFacetsError}
						onValueChange={handleResultsViewChange}
						onFilterToggle={handleFilterToggle}
						onToggleDenoisePanel={() =>
							setIsDenoisePanelVisible(!isDenoisePanelVisible)
						}
						onToggleRootSpansOnly={() =>
							setIsRootSpansOnly((current) => !current)
						}
						onLevelToggle={handleLevelToggle}
						onClearLevels={handleClearLevels}
						onClearAllFilters={handleClearAllFilters}
						onToggleLevelDist={handleToggleLevelDist}
						onDynamicFacetToggle={handleDynamicFacetToggle}
						onDynamicFacetClear={handleDynamicFacetClear}
						className={`fixed top-13 bottom-0 z-20 hidden w-[280px] border-[color:var(--surface-border)] border-r bg-background shadow-[12px_0_32px_rgba(0,0,0,0.08)] xl:flex dark:shadow-[12px_0_32px_rgba(0,0,0,0.24)] ${isAppSidebarExpanded ? "left-48" : "left-12"}`}
					/>
				)}

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
							<>
								<div className="border-[color:var(--surface-border)] border-b px-4 pt-4 pb-2 sm:px-6">
									<LogsVolumeChart
										points={volumeData.points}
										groups={volumeData.groups}
										xAxisTicks={volumeData.xAxisTicks}
										isLoading={isRunning && volumeResult == null}
										error={volumeError}
										activeDrilldown={chartDrilldown}
										activePopover={activeChartPopover}
										onOpenPopover={setActiveChartPopover}
										onClosePopover={() => setActiveChartPopover(null)}
										onApplyDrilldown={applyChartDrilldown}
										onClearDrilldown={clearChartDrilldown}
									/>
								</div>
								{resultsView === "groups" ? (
									<LogsPatternsTable
										result={patternsResult}
										isRunning={isRunning && tableResult == null}
									/>
								) : (
									<div className="flex min-h-0 flex-1 flex-col">
										{search.denoise && isDenoisePanelVisible && (
											<div className="border-[color:var(--surface-border)] border-b px-4 py-3 sm:px-6">
												<div className="flex items-center gap-2 font-medium text-amber-600 text-sm dark:text-amber-500">
													<span>Removed Noisy Event Patterns</span>
												</div>
												{noisyGroups.length > 0 ? (
													<div className="mt-2 flex flex-col gap-1.5">
														{noisyGroups.map((g) => (
															<div
																key={g.id}
																className="flex items-start gap-2 text-stone-600 text-xs dark:text-stone-400"
															>
																<span className="mt-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-stone-800">
																	{(
																		(g.count /
																			(tableResult?.data?.length || 1)) *
																		100
																	).toFixed(1)}
																	%
																</span>
																<span className="line-clamp-2 flex-1 font-mono">
																	{g.pattern}
																</span>
															</div>
														))}
													</div>
												) : (
													<div className="mt-2 text-stone-500 text-xs">
														No noisy patterns found (&gt;10% of results).
													</div>
												)}
											</div>
										)}
										<DynamicResultsTable
											className="flex-1"
											rows={denoisedRows}
											columns={tableColumns}
											hideHeader
											enableWrapToggle
											enableCsvDownload
											enableGeneratedSql
											fitToContainer
											generatedSql={generatedTableSql}
											csvExportRows={denoisedRows}
											csvFileName={() => "logs-table-results"}
											hiddenColumnKeys={hiddenRowSelectorAliases}
											selectedRowKey={
												selectedRowIdentity?.selectedRowKey ?? null
											}
											getRowKey={getRowKey}
											onRowClick={handleRowClick}
											statistics={tableResult?.statistics}
											emptyState={
												<div className="flex h-full min-h-[18rem] items-center justify-center text-muted-foreground text-sm">
													Run a query to fill this space with log rows.
												</div>
											}
										/>
									</div>
								)}
							</>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}
