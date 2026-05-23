import { cn } from "@/web/utils/cn";

export type LogsBarsSparklinePoint = {
	key: string;
	value: number;
	label?: string;
};

const LOG_CHART_COLORS: Record<string, string> = {
	FATAL: "#f87171",
	CRITICAL: "#fb7185",
	ERROR: "#d98b86",
	WARN: "#d6b84a",
	INFO: "#7ea6d9",
	OK: "#8fbf9f",
	DEBUG: "#8aa0c8",
	TRACE: "#9a8fc8",
	UNSET: "#a9adc1",
	null: "#7d828d",
	unknown: "#7d828d",
	__all__: "#a9adc1",
};

export function getLogsChartColor(groupKey: string) {
	return LOG_CHART_COLORS[groupKey] ?? "#7dd3fc";
}

export function getLogsChartBarTone(level: string | null | undefined) {
	const key = level?.trim().toUpperCase() ?? "__all__";

	if (key === "WARNING") {
		return getLogsChartColor("WARN");
	}
	if (key === "UNKNOWN") {
		return getLogsChartColor("unknown");
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
					"flex min-w-0 flex-1 items-end border-stone-300/80 border-b pb-0.5 dark:border-stone-700/80",
					compact ? "gap-px" : "gap-[3px]",
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
								"min-w-px flex-1 opacity-95",
								interactive &&
									"transition-[box-shadow,opacity] duration-150 hover:opacity-100 hover:shadow-[0_0_0_2px_rgba(68,64,60,0.3),0_0_12px_rgba(68,64,60,0.24),0_4px_12px_rgba(68,64,60,0.18)] dark:hover:shadow-[0_0_0_2px_rgba(214,211,209,0.32),0_0_12px_rgba(214,211,209,0.18),0_4px_14px_rgba(0,0,0,0.42)]",
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
