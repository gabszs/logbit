import { useEffect, useMemo, useState } from "react";
import { Button } from "@/web/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/web/components/ui/sheet";
import type { ClickhouseRow } from "./dynamic-results-table";
import { DynamicResultsTable } from "./dynamic-results-table";
import type { LogsPatternGroup } from "../-lib/logs-patterns";

const INITIAL_SAMPLE_LIMIT = 100;

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

export function LogsPatternsPanel({
	group,
	open,
	onOpenChange,
	bodyKey,
	levelKey,
	serviceKey,
	timestampKey,
}: {
	group: LogsPatternGroup | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bodyKey: string | null;
	levelKey: string | null;
	serviceKey: string | null;
	timestampKey: string | null;
}) {
	const [showAllSamples, setShowAllSamples] = useState(false);

	useEffect(() => {
		setShowAllSamples(false);
	}, [group?.id]);

	const displayedSamples = useMemo(
		() =>
			group
				? showAllSamples
					? group.samples
					: group.samples.slice(0, INITIAL_SAMPLE_LIMIT)
				: [],
		[group, showAllSamples],
	);
	const canShowMore = Boolean(group && group.samples.length > INITIAL_SAMPLE_LIMIT);

	const sampleColumns = [
		timestampKey
			? {
					key: timestampKey,
					label: "Timestamp",
				}
			: null,
		serviceKey
			? {
					key: serviceKey,
					label: "Service",
				}
			: null,
		levelKey
			? {
					key: levelKey,
					label: "Level",
				}
			: null,
		bodyKey
			? {
					key: bodyKey,
					label: "Body",
				}
			: null,
	].filter((column): column is { key: string; label: string } => column != null);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-[92vw] max-w-none gap-0 border-[color:var(--surface-border)] bg-[color:var(--surface-background)] p-0 sm:w-[70vw] sm:max-w-none"
			>
				{group ? (
					<div className="flex min-h-0 flex-1 flex-col">
						<SheetHeader className="border-[color:var(--surface-border)] border-b px-5 py-4 text-left">
							<SheetTitle className="text-base">Pattern</SheetTitle>
							<SheetDescription className="mt-1 text-xs leading-6">
								Inspect sample events for grouped log pattern.
							</SheetDescription>
						</SheetHeader>

						<div className="space-y-4 border-[color:var(--surface-border)] border-b px-5 py-4">
							{group.level ? (
								<div className="flex flex-wrap items-center gap-2">
									<span
										className={`inline-flex h-5 items-center rounded border px-1.5 font-mono text-[11px] leading-none ${getSeverityBadgeClass(group.level)}`}
									>
										{group.level}
									</span>
								</div>
							) : null}

							<div className="rounded-lg border border-[color:var(--surface-border)] bg-[#faf9f6]/70 px-4 py-3 font-mono text-[13px] leading-6 text-foreground dark:bg-stone-950/70">
								{group.pattern}
							</div>
						</div>

						<div className="min-h-0 flex-1 overflow-hidden">
							<DynamicResultsTable
								className="h-full"
								title={`Sample events ${group.countLabel}`}
								rows={displayedSamples as ClickhouseRow[]}
								columns={sampleColumns}
								emptyState={
									<div className="flex h-full min-h-[14rem] items-center justify-center text-muted-foreground text-sm">
										No sample events available for this pattern.
									</div>
								}
							/>
						</div>

						{canShowMore ? (
							<div className="border-[color:var(--surface-border)] border-t px-5 py-4">
								<Button
									type="button"
									variant="outline"
									className="w-full border-[color:var(--surface-border)]"
									onClick={() => setShowAllSamples(true)}
								>
									Show all {group.samples.length.toLocaleString()} samples
								</Button>
							</div>
						) : null}
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
