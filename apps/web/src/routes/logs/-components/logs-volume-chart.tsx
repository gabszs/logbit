import { BarChart3, Filter, Rows3, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
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

function getGroupColor(groupKey: string) {
	return getLogsChartColor(groupKey);
}

function formatEventCount(value: number) {
	return `${value.toLocaleString()} event${value === 1 ? "" : "s"}`;
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
	isLoading: boolean;
	error: string | null;
	activeDrilldown: LogsChartDrilldown | null;
	activePopover: LogsVolumeActivePopover | null;
	onOpenPopover: (popover: LogsVolumeActivePopover) => void;
	onClosePopover: () => void;
	onApplyDrilldown: (drilldown: LogsChartDrilldown) => void;
	onClearDrilldown: () => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateSize = () => {
			setContainerSize({
				width: container.clientWidth,
				height: container.clientHeight,
			});
		};

		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(container);
		return () => observer.disconnect();
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
				ref={containerRef}
				className="relative overflow-visible rounded-md bg-[#faf9f6]/85 px-2 py-1.5 shadow-none dark:bg-stone-950/80"
			>
				{points.length === 0 ? (
					<LogsVolumeState
						title="No volume data yet"
						description="Run a query to see stacked log volume by time bucket."
					/>
				) : (
					<div className="h-[5.5rem]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={points}
								barCategoryGap={2}
								margin={{ top: 2, right: 8, left: -20, bottom: -10 }}
							>
								<CartesianGrid
									stroke="rgba(148, 163, 184, 0.14)"
									vertical={false}
								/>
								<XAxis
									dataKey="bucketStart"
									tickLine={false}
									axisLine={false}
									minTickGap={20}
									tickFormatter={(value) => {
										const point = points.find(
											(entry) => entry.bucketStart === value,
										);
										return point?.bucketLabel ?? "";
									}}
									tick={{
										fontSize: 11,
										fill: "var(--muted-foreground)",
										fontFamily: "ui-monospace, monospace",
									}}
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									width={42}
									tick={{
										fontSize: 11,
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
									cursor={{
										fill: "rgba(148, 163, 184, 0.08)",
									}}
									content={({ active, payload, label }) => {
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
											<div className="min-w-[14rem] rounded-md border border-stone-200 bg-[#faf9f6]/95 px-3 py-2.5 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
												<div className="font-medium text-foreground text-sm">
													{typeof label === "string"
														? label
														: point.bucketLabel}
												</div>
												<div className="mt-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
													{formatEventCount(point.total)}
												</div>
												<div className="mt-3 space-y-1.5">
													{point.groups.map((group) => (
														<div
															key={group.key}
															className="flex items-center justify-between gap-3 text-xs"
														>
															<div className="flex items-center gap-2 text-foreground">
																<span
																	className="size-2.5 rounded-full"
																	style={{
																		backgroundColor: getGroupColor(group.key),
																	}}
																/>
																<span>{group.label}</span>
															</div>
															<span className="font-mono text-muted-foreground">
																{group.count.toLocaleString()}
															</span>
														</div>
													))}
												</div>
											</div>
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
										radius={[3, 3, 0, 0]}
										maxBarSize={30}
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
