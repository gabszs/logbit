import { cn } from "@/web/utils/cn";

export type LogsBarsSparklinePoint = {
	key: string;
	value: number;
	label?: string;
};

const LOG_CHART_COLORS: Record<string, string> = {
	FATAL: "#ff5d73",
	ERROR: "#ff7a59",
	WARN: "#f4b942",
	INFO: "#2dd4bf",
	DEBUG: "#60a5fa",
	TRACE: "#a78bfa",
	unknown: "#94a3b8",
	__all__: "#2dd4bf",
};

export function getLogsChartColor(groupKey: string) {
	return LOG_CHART_COLORS[groupKey] ?? "#7dd3fc";
}

export function getLogsChartBarTone(level: string | null | undefined) {
	const key = level?.trim().toUpperCase() ?? "__all__";

	if (key === "WARNING") {
		return getLogsChartColor("WARN");
	}

	return getLogsChartColor(key || "__all__");
}

export function LogsBarsSparkline({
	points,
	color,
	height = 40,
	compact = false,
	showYAxisMax = false,
	interactive = false,
	className,
}: {
	points: LogsBarsSparklinePoint[];
	color: string;
	height?: number;
	compact?: boolean;
	showYAxisMax?: boolean;
	interactive?: boolean;
	className?: string;
}) {
	const maxValue = Math.max(0, ...points.map((point) => point.value));

	return (
		<div className={cn("flex w-full items-end gap-2", className)}>
			{showYAxisMax ? (
				<div className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
					{maxValue.toLocaleString()}
				</div>
			) : null}
			<div
				className={cn(
					"grid min-w-0 flex-1 grid-flow-col auto-cols-fr items-end border-stone-300/80 border-b pb-0.5 dark:border-stone-700/80",
					compact ? "gap-[2px]" : "gap-[3px]",
				)}
				style={{ height }}
			>
				{points.map((point) => {
					const normalizedHeight =
						maxValue > 0
							? Math.max((point.value / maxValue) * 100, compact ? 12 : 8)
							: compact
								? 12
								: 8;

					return (
						<div
							key={point.key}
							className={cn(
								"w-full rounded-t-sm opacity-95",
								interactive && "transition-opacity hover:opacity-100",
							)}
							style={{
								height: `${normalizedHeight}%`,
								backgroundColor: color,
							}}
							title={point.label}
						/>
					);
				})}
			</div>
		</div>
	);
}
