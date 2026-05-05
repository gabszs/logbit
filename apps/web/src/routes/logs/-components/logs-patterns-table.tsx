import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/web/components/ui/skeleton";
import { cn } from "@/web/utils/cn";
import type {
	LogsPatternComputationResult,
	LogsPatternGroup,
} from "../-lib/logs-patterns";
import {
	getLogsChartBarTone,
	LogsBarsSparkline,
} from "./logs-chart-primitives";
import { LogsPatternsPanel } from "./logs-patterns-panel";

function getSeverityBadgeClass(level: string) {
	switch (level) {
		case "TRACE":
			return "border-stone-300 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300";
		case "DEBUG":
			return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/70 dark:text-blue-300";
		case "INFO":
			return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/80 dark:bg-emerald-950/70 dark:text-emerald-300";
		case "WARN":
			return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/80 dark:bg-amber-950/70 dark:text-amber-300";
		case "ERROR":
			return "border-red-300 bg-red-50 text-red-700 dark:border-red-900/80 dark:bg-red-950/70 dark:text-red-300";
		case "FATAL":
			return "border-purple-400 bg-purple-50 text-purple-800 dark:border-purple-900/80 dark:bg-purple-950/80 dark:text-purple-300";
		default:
			return "border-stone-300 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300";
	}
}

function GroupsState({
	title,
	description,
	tone = "muted",
}: {
	title: string;
	description: string;
	tone?: "muted" | "warning";
}) {
	return (
		<div
			className={cn(
				"flex h-full min-h-[18rem] items-center justify-center px-6 py-10 text-center",
				tone === "warning"
					? "text-amber-900 dark:text-amber-100"
					: "text-muted-foreground",
			)}
		>
			<div
				className={cn(
					"max-w-xl rounded-xl border border-dashed px-5 py-4",
					tone === "warning"
						? "border-amber-300/50 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
						: "border-[color:var(--surface-border)] bg-[#faf9f6]/70 dark:bg-stone-950/70",
				)}
			>
				<p className="font-medium text-sm">{title}</p>
				<p className="mt-1 text-xs leading-6">{description}</p>
			</div>
		</div>
	);
}

function TrendBars({ group }: { group: LogsPatternGroup }) {
	return (
		<LogsBarsSparkline
			points={group.trend.map((point) => ({
				key: point.bucketStart,
				value: point.count,
				label: `${point.count.toLocaleString()} events`,
			}))}
			color={getLogsChartBarTone(group.level)}
			height={40}
			compact
			showYAxisMax
			className="min-w-[10rem]"
		/>
	);
}

function LoadingRows() {
	return (
		<div className="space-y-3 px-4 py-4 sm:px-6">
			{Array.from({ length: 6 }).map((_, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: deterministic skeleton rows
					key={index}
					className="grid grid-cols-[11rem_8rem_8rem_minmax(0,1fr)] items-center gap-4 rounded-lg border border-[color:var(--surface-border)] bg-[#faf9f6]/70 px-4 py-3 dark:bg-stone-950/70"
				>
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-5 w-14" />
					<Skeleton className="h-5 w-16" />
					<Skeleton className="h-5 w-full" />
				</div>
			))}
		</div>
	);
}

export function LogsPatternsTable({
	result,
	isRunning,
}: {
	result: LogsPatternComputationResult;
	isRunning: boolean;
}) {
	const [selectedPattern, setSelectedPattern] =
		useState<LogsPatternGroup | null>(null);

	useEffect(() => {
		if (!selectedPattern) return;

		const updatedPattern = result.groups.find(
			(group) => group.id === selectedPattern.id,
		);
		if (updatedPattern && updatedPattern !== selectedPattern) {
			setSelectedPattern(updatedPattern);
		}
	}, [result.groups, selectedPattern]);

	const content = useMemo(() => {
		if (result.missingRequiredFields.length > 0) {
			const missingLabels = result.missingRequiredFields.map((field) =>
				field === "body" ? "message/body" : "timestamp",
			);
			return (
				<GroupsState
					title="Groups mode needs more fields in current SELECT"
					description={`Include ${missingLabels.join(" and ")} columns in current query to derive event patterns from loaded results.`}
					tone="warning"
				/>
			);
		}

		if (isRunning && result.groups.length === 0) {
			return <LoadingRows />;
		}

		if (result.groups.length === 0) {
			return (
				<GroupsState
					title="No groups available"
					description="Run a query with log rows to cluster patterns into grouped results."
				/>
			);
		}

		return (
			<section className="flex min-h-0 flex-1 flex-col bg-[color:var(--surface-background)]">
				<div className="flex items-center gap-2 border-[color:var(--surface-border)] border-b px-4 py-3 sm:px-6">
					<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
						Event patterns
					</h2>
					<div className="h-px flex-1 bg-[color:var(--surface-border)]" />
					<div className="font-mono text-muted-foreground text-xs tabular-nums">
						{result.groups.length.toLocaleString()} groups
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-auto bg-[color:var(--surface-background)]">
					<table className="min-w-full border-separate border-spacing-0 text-left">
						<thead className="sticky top-0 z-10 bg-[color:var(--surface-background)]/95 backdrop-blur-sm">
							<tr>
								<th className="w-[11rem] min-w-[11rem] border-[color:var(--surface-border)] border-b px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em] sm:px-6">
									Trend
								</th>
								<th className="w-[8rem] min-w-[8rem] border-[color:var(--surface-border)] border-b px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
									Count
								</th>
								<th className="w-[8rem] min-w-[8rem] border-[color:var(--surface-border)] border-b px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
									Level
								</th>
								<th className="border-[color:var(--surface-border)] border-b px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
									Pattern
								</th>
							</tr>
						</thead>
						<tbody>
							{result.groups.map((group) => (
								<tr
									key={group.id}
									className="cursor-pointer border-[color:var(--surface-border)] border-b transition-colors hover:bg-muted/30"
									onClick={() => setSelectedPattern(group)}
								>
									<td className="border-[color:var(--surface-border)] border-b px-4 py-3 align-top sm:px-6">
										<TrendBars group={group} />
									</td>
									<td className="border-[color:var(--surface-border)] border-b px-4 py-3 align-top">
										<div className="font-mono text-[15px] text-foreground tabular-nums">
											{group.countLabel}
										</div>
									</td>
									<td className="border-[color:var(--surface-border)] border-b px-4 py-3 align-top">
										{group.level ? (
											<span
												className={`inline-flex h-5 max-w-full items-center rounded border px-1.5 font-mono text-[11px] leading-none ${getSeverityBadgeClass(group.level)}`}
											>
												{group.level}
											</span>
										) : (
											<span className="font-mono text-[13px] text-muted-foreground">
												—
											</span>
										)}
									</td>
									<td className="border-[color:var(--surface-border)] border-b px-4 py-3 align-top">
										<div className="max-w-none break-words font-mono text-[13px] text-foreground leading-6">
											{group.pattern}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		);
	}, [isRunning, result]);

	return (
		<>
			{content}

			<LogsPatternsPanel
				group={selectedPattern}
				open={selectedPattern != null}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedPattern(null);
					}
				}}
				bodyKey={result.bodyKey}
				levelKey={result.levelKey}
				serviceKey={result.serviceKey}
				timestampKey={result.timestampKey}
			/>
		</>
	);
}
