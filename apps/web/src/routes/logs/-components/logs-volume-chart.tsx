import { BarChart3, Filter, Rows3, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Bar,
	BarChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { Skeleton } from "@/web/components/ui/skeleton";
import { cn } from "@/web/utils/cn";
import type {
	LogsChartDrilldown,
	LogsVolumeGroup,
	LogsVolumePoint,
} from "../-lib/logs-queries";
import { getLogsChartColor } from "./logs-chart-primitives";

export type LogsVolumeActivePopover = {
	x: number;
	y: number;
	bucketLabel: string;
	bucketStart: string;
	bucketEnd: string;
	groups: Array<LogsVolumeGroup & { count: number; color: string }>;
};

const DEFAULT_LOG_LEVELS = [
	"FATAL",
	"ERROR",
	"WARN",
	"INFO",
	"DEBUG",
	"TRACE",
	"unknown",
] as const;
function createChartGeometry() {
	const margin = { top: 2, right: 8, left: -18, bottom: 0 };
	const yAxisWidth = 42;
	const xAxisHeight = 22;

	return {
		margin,
		yAxisWidth,
		xAxisHeight,
		trackInset: {
			top: margin.top,
			right: margin.right,
			bottom: xAxisHeight + margin.bottom,
			left: yAxisWidth + margin.left,
		},
	};
}

const CHART_GEOMETRY = createChartGeometry();

function getGroupColor(groupKey: string) {
	return getLogsChartColor(groupKey);
}

function formatEventCount(value: number) {
	return `${value.toLocaleString()} event${value === 1 ? "" : "s"}`;
}

function formatTooltipCount(value: number) {
	return value > 0 ? value.toLocaleString() : "N/A";
}

function formatTooltipGroupLabel(label: string) {
	return label === "unknown" ? "null" : label;
}

function buildPopoverGroups(
	point: LogsVolumePoint,
	groups: LogsVolumeGroup[],
): Array<LogsVolumeGroup & { count: number; color: string }> {
	const filterableGroups = groups.filter((group) => group.canFilter);
	if (filterableGroups.length === 0) {
		return point.groups.map((group) => ({
			...group,
			color: getGroupColor(group.key),
		}));
	}

	const customGroups = filterableGroups.filter(
		(group) =>
			!DEFAULT_LOG_LEVELS.includes(
				group.key as (typeof DEFAULT_LOG_LEVELS)[number],
			),
	);
	const orderedGroups = [
		...DEFAULT_LOG_LEVELS.map((groupKey) => {
			const existingGroup = filterableGroups.find(
				(group) => group.key === groupKey,
			);
			return (
				existingGroup ?? {
					key: groupKey,
					label: groupKey,
					canFilter: true,
				}
			);
		}),
		...customGroups,
	];

	return orderedGroups.map((group) => ({
		...group,
		count: point.values[group.key] ?? 0,
		color: getGroupColor(group.key),
	}));
}

function LogsVolumeTooltipContent({
	point,
	groups,
}: {
	point: LogsVolumePoint;
	groups: LogsVolumeGroup[];
}) {
	const tooltipGroups = (groups.length ? groups : point.groups).map(
		(group) => ({
			...group,
			count: point.values[group.key] ?? 0,
			color: getGroupColor(group.key),
		}),
	);

	return (
		<div className="min-w-[9.5rem] rounded-[3px] border border-[#30333a] bg-[#0b0c0f] px-2.5 py-2 font-mono text-[12px] leading-5 shadow-none">
			<div className="mb-1 whitespace-nowrap text-[#f3f4f6]">
				{point.bucketLabel}
			</div>
			<div className="space-y-0.5">
				{tooltipGroups.map((group) => (
					<div
						key={group.key}
						className="grid grid-cols-[1fr_auto] items-center gap-8"
					>
						<div className="flex min-w-0 items-center gap-1.5 text-[#c8ccd4]">
							<span
								className="size-2.5 shrink-0 rounded-full"
								style={{ backgroundColor: group.color }}
							/>
							<span className="truncate">
								{formatTooltipGroupLabel(group.label)}
							</span>
						</div>
						<span className="text-right font-semibold text-[#d7dbe2] tabular-nums">
							{formatTooltipCount(group.count)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function LogsVolumeState({
	title,
	description,
	tone = "muted",
}: {
	title: string;
	description: string;
	tone?: "muted" | "error";
}) {
	return (
		<div
			className={cn(
				"flex h-full min-h-[6rem] items-center justify-center rounded-md border border-dashed px-4 text-center",
				tone === "error"
					? "border-destructive/30 bg-destructive/5 text-destructive"
					: "border-stone-200 bg-[#faf9f6]/80 text-muted-foreground dark:border-stone-800 dark:bg-stone-950/80",
			)}
		>
			<div className="max-w-md space-y-1.5">
				<p className="font-medium text-sm">{title}</p>
				<p className="text-xs leading-5">{description}</p>
			</div>
		</div>
	);
}

function LogsVolumeLoading() {
	return (
		<div className="space-y-2.5 rounded-md border border-stone-200 bg-[#faf9f6]/80 px-3 py-2.5 shadow-none dark:border-stone-800 dark:bg-stone-950/80">
			<div className="flex items-center justify-between gap-2.5">
				<div className="flex items-center gap-3">
					<Skeleton className="h-5 w-16 rounded-full" />
					<Skeleton className="h-4 w-28 rounded-md" />
				</div>
				<Skeleton className="h-8 w-28 rounded-lg" />
			</div>
			<div className="flex h-[5.5rem] items-end gap-1.5">
				{Array.from({ length: 24 }).map((_, index) => (
					<Skeleton
						// biome-ignore lint/suspicious/noArrayIndexKey: deterministic loading bars
						key={index}
						className="flex-1 rounded-t-md"
						style={{
							height: `${12 + ((index % 7) + 1) * 6}px`,
						}}
					/>
				))}
			</div>
		</div>
	);
}

function isLogsVolumePoint(value: object | null): value is LogsVolumePoint {
	if (!value) return false;

	return (
		"bucketLabel" in value &&
		"bucketStart" in value &&
		"bucketEnd" in value &&
		"groups" in value &&
		Array.isArray(value.groups)
	);
}

export function LogsVolumeChart({
	points,
	groups,
	xAxisTicks,
	isLoading,
	error,
	activeDrilldown,
	activePopover,
	onOpenPopover,
	onClosePopover,
	onApplyDrilldown,
	onClearDrilldown,
}: {
	points: LogsVolumePoint[];
	groups: LogsVolumeGroup[];
	xAxisTicks: string[];
	isLoading: boolean;
	error: string | null;
	activeDrilldown: LogsChartDrilldown | null;
	activePopover: LogsVolumeActivePopover | null;
	onOpenPopover: (popover: LogsVolumeActivePopover) => void;
	onClosePopover: () => void;
	onApplyDrilldown: (drilldown: LogsChartDrilldown) => void;
	onClearDrilldown: () => void;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
	const observerRef = useRef<ResizeObserver | null>(null);

	const setContainerRef = useCallback((node: HTMLDivElement | null) => {
		containerRef.current = node;

		if (observerRef.current) {
			observerRef.current.disconnect();
			observerRef.current = null;
		}

		if (!node) return;

		const updateSize = () => {
			setContainerSize({
				width: node.clientWidth,
				height: node.clientHeight,
			});
		};

		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(node);
		observerRef.current = observer;
	}, []);

	useEffect(() => {
		if (!activePopover) return;

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			if (
				popoverRef.current?.contains(target) ||
				containerRef.current?.contains(target)
			) {
				return;
			}

			onClosePopover();
		};

		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [activePopover, onClosePopover]);

	const totalCount = useMemo(
		() => points.reduce((sum, point) => sum + point.total, 0),
		[points],
	);
	const selectedBucketStart = useMemo(
		() => activePopover?.bucketStart ?? activeDrilldown?.bucketStart ?? null,
		[activeDrilldown?.bucketStart, activePopover?.bucketStart],
	);
	const xAxisLabelByBucket = useMemo(
		() =>
			new Map(
				points
					.filter((point) => point.xAxisLabel)
					.map((point) => [point.bucketStart, point.xAxisLabel ?? ""]),
			),
		[points],
	);
	const chartBarSize = useMemo(() => {
		if (containerSize.width <= 0 || points.length === 0) {
			return 4;
		}

		const plotWidth = Math.max(
			0,
			containerSize.width -
				CHART_GEOMETRY.trackInset.left -
				CHART_GEOMETRY.trackInset.right,
		);
		const slotWidth = plotWidth / points.length;
		return Math.max(1, Math.floor(slotWidth * 0.82));
	}, [containerSize.width, points.length]);

	const popoverStyle = useMemo(() => {
		if (!activePopover) return null;

		const maxWidth = 280;
		const left = Math.max(
			12,
			Math.min(
				activePopover.x - 18,
				Math.max(12, containerSize.width - maxWidth),
			),
		);
		const shouldOpenUpward =
			containerSize.height > 0 && activePopover.y > containerSize.height * 0.56;

		return {
			left,
			top: shouldOpenUpward ? activePopover.y - 12 : activePopover.y + 14,
			transform: shouldOpenUpward ? "translateY(-100%)" : "translateY(0)",
		};
	}, [activePopover, containerSize.height, containerSize.width]);

	if (isLoading) {
		return <LogsVolumeLoading />;
	}

	if (error) {
		return (
			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className="border-destructive/30 bg-destructive/10 text-destructive"
						>
							<BarChart3 className="size-3.5" />
							Volume
						</Badge>
						<span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
							Local chart error
						</span>
					</div>
				</div>
				<LogsVolumeState
					title="Volumetry query failed"
					description={error}
					tone="error"
				/>
			</section>
		);
	}

	return (
		<section className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2.5">
					<Badge
						variant="outline"
						className="border-stone-200 bg-[#faf9f6]/80 text-foreground dark:border-stone-800 dark:bg-stone-950/80"
					>
						<BarChart3 className="size-3.5 text-primary" />
						Volume
					</Badge>
					<div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
						{formatEventCount(totalCount)}
					</div>
					<div className="hidden h-3 w-px bg-[color:var(--surface-border)] sm:block" />
					<div className="hidden font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em] sm:block">
						{groups.length > 1
							? `${groups.length.toLocaleString()} groups stacked`
							: "Single series"}
					</div>
				</div>
				{activeDrilldown ? (
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className="border-primary/25 bg-primary/10 px-2.5 py-1 text-primary"
						>
							<Filter className="size-3.5" />
							{activeDrilldown.label}
						</Badge>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-8 px-2.5 text-xs"
							onClick={onClearDrilldown}
						>
							<X className="size-3.5" />
							Clear
						</Button>
					</div>
				) : null}
			</div>

			<div
				ref={setContainerRef}
				className="relative overflow-visible rounded-md border border-stone-200/80 bg-[#f7f6f1]/85 px-2 py-1.5 shadow-none dark:border-stone-800/80 dark:bg-[#050506]"
			>
				{points.length === 0 ? (
					<LogsVolumeState
						title="No volume data yet"
						description="Run a query to see stacked log volume by time bucket."
					/>
				) : (
					<div className="relative h-[5.5rem]">
						<div
							className="pointer-events-none absolute z-0 grid"
							style={{
								top: CHART_GEOMETRY.trackInset.top,
								right: CHART_GEOMETRY.trackInset.right,
								bottom: CHART_GEOMETRY.trackInset.bottom,
								left: CHART_GEOMETRY.trackInset.left,
								gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
							}}
						>
							{points.map((point) => (
								<div
									key={point.bucketStart}
									className="flex h-full justify-center"
								>
									<div
										className="h-full bg-stone-400/20 dark:bg-white/[0.075]"
										style={{ width: chartBarSize }}
									/>
								</div>
							))}
						</div>
						<ResponsiveContainer
							width="100%"
							height="100%"
							className="relative z-10"
						>
							<BarChart
								data={points}
								barCategoryGap={0}
								barGap={0}
								barSize={chartBarSize}
								margin={CHART_GEOMETRY.margin}
							>
								<XAxis
									dataKey="bucketStart"
									ticks={xAxisTicks}
									height={CHART_GEOMETRY.xAxisHeight}
									interval={0}
									tickLine={false}
									axisLine={false}
									tickMargin={4}
									tickFormatter={(value) => {
										return xAxisLabelByBucket.get(String(value)) ?? "";
									}}
									tick={{
										fontSize: 10,
										fill: "var(--muted-foreground)",
										fontFamily: "ui-monospace, monospace",
									}}
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									width={CHART_GEOMETRY.yAxisWidth}
									tick={{
										fontSize: 10,
										fill: "var(--muted-foreground)",
										fontFamily: "ui-monospace, monospace",
									}}
								/>
								{selectedBucketStart ? (
									<ReferenceLine
										x={selectedBucketStart}
										stroke="var(--color-primary)"
										strokeWidth={1.5}
										strokeDasharray="4 4"
									/>
								) : null}
								<Tooltip
									offset={{ x: 12, y: 16 }}
									reverseDirection={{ x: false, y: true }}
									allowEscapeViewBox={{ x: false, y: true }}
									wrapperStyle={{
										outline: "none",
										pointerEvents: "none",
										zIndex: 30,
									}}
									cursor={{
										fill: "rgba(148, 163, 184, 0.08)",
									}}
									content={({ active, payload }) => {
										if (!active || !payload?.length) {
											return null;
										}

										const pointPayload = payload[0]?.payload;
										if (
											!pointPayload ||
											typeof pointPayload !== "object" ||
											!isLogsVolumePoint(pointPayload)
										) {
											return null;
										}

										const point = pointPayload;
										return (
											<LogsVolumeTooltipContent point={point} groups={groups} />
										);
									}}
								/>
								{groups.map((group) => (
									<Bar
										key={group.key}
										stackId="logs"
										dataKey={(point: LogsVolumePoint) =>
											point.values[group.key] ?? 0
										}
										name={group.label}
										fill={getGroupColor(group.key)}
										radius={0}
										maxBarSize={chartBarSize}
										cursor="pointer"
										onClick={(data) => {
											const payload = data.payload;
											if (
												!payload ||
												typeof payload !== "object" ||
												!isLogsVolumePoint(payload)
											) {
												onClosePopover();
												return;
											}

											onOpenPopover({
												x: data.x + data.width / 2,
												y: data.y,
												bucketLabel: payload.bucketLabel,
												bucketStart: payload.bucketStart,
												bucketEnd: payload.bucketEnd,
												groups: buildPopoverGroups(payload, groups),
											});
										}}
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					</div>
				)}

				{activePopover && popoverStyle ? (
					<div
						ref={popoverRef}
						className="absolute z-20 w-[17.5rem] rounded-md border border-stone-200 bg-[#faf9f6]/96 p-3 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-950/96"
						style={popoverStyle}
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<div className="font-medium text-foreground text-sm">
									{activePopover.bucketLabel}
								</div>
								<div className="mt-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
									{formatEventCount(
										activePopover.groups.reduce(
											(sum, group) => sum + group.count,
											0,
										),
									)}
								</div>
							</div>
							<button
								type="button"
								onClick={onClosePopover}
								className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								aria-label="Close chart actions"
							>
								<X className="size-4" />
							</button>
						</div>

						<div className="mt-3 space-y-2">
							<button
								type="button"
								onClick={() => {
									onApplyDrilldown({
										bucketStart: activePopover.bucketStart,
										bucketEnd: activePopover.bucketEnd,
										groupValue: null,
										label: `${activePopover.bucketLabel} · all events`,
									});
									onClosePopover();
								}}
								className="flex w-full items-center gap-2 rounded-md border border-stone-200 bg-[#faf9f6]/80 px-3 py-2 text-left transition-colors hover:bg-accent/60 dark:border-stone-800 dark:bg-stone-950/80"
							>
								<Rows3 className="size-4 text-primary" />
								<div>
									<div className="font-medium text-foreground text-sm">
										View all events
									</div>
									<div className="text-muted-foreground text-xs">
										Apply only this time bucket
									</div>
								</div>
							</button>

							{activePopover.groups.some((group) => group.canFilter) ? (
								<div className="space-y-2">
									<div className="px-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
										Filter by group
									</div>
									<div className="space-y-1">
										{activePopover.groups
											.filter((group) => group.canFilter)
											.map((group) => (
												<button
													key={group.key}
													type="button"
													onClick={() => {
														onApplyDrilldown({
															bucketStart: activePopover.bucketStart,
															bucketEnd: activePopover.bucketEnd,
															groupValue: group.key,
															label: `${activePopover.bucketLabel} · ${group.label}`,
														});
														onClosePopover();
													}}
													className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/60"
												>
													<div className="flex items-center gap-2 text-foreground text-sm">
														<span
															className="size-2.5 rounded-full"
															style={{ backgroundColor: group.color }}
														/>
														<span>{group.label}</span>
													</div>
													<span className="font-mono text-[11px] text-muted-foreground">
														{group.count.toLocaleString()}
													</span>
												</button>
											))}
									</div>
								</div>
							) : null}
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
}
