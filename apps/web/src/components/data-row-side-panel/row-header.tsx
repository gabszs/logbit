import { CopyButton } from "@/web/components/ui/copy-button";
import { cn } from "@/web/utils/cn";
import type { ResolvedRowFields } from "./types";
import { toDisplayText } from "./value-formatting";

function getSeverityBadgeClass(level: string) {
	switch (level) {
		case "TRACE":
			return "border-stone-300 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300";
		case "DEBUG":
			return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/70 dark:text-blue-300";
		case "INFO":
			return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/80 dark:bg-emerald-950/70 dark:text-emerald-300";
		case "WARN":
		case "WARNING":
			return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/80 dark:bg-amber-950/70 dark:text-amber-300";
		case "ERROR":
			return "border-red-300 bg-red-50 text-red-700 dark:border-red-900/80 dark:bg-red-950/70 dark:text-red-300";
		case "FATAL":
			return "border-purple-400 bg-purple-50 text-purple-800 dark:border-purple-900/80 dark:bg-purple-950/80 dark:text-purple-300";
		default:
			return "border-stone-300 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300";
	}
}

function parseDate(value: unknown) {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatCompactTimeAgo(date: Date) {
	const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
	const absDiffSeconds = Math.abs(diffSeconds);

	if (absDiffSeconds < 60) {
		return diffSeconds >= 0
			? `in ${Math.max(1, absDiffSeconds)}s`
			: `${Math.max(1, absDiffSeconds)}s ago`;
	}

	const diffMinutes = Math.round(diffSeconds / 60);
	const absDiffMinutes = Math.abs(diffMinutes);
	if (absDiffMinutes < 60) {
		return diffMinutes >= 0
			? `in ${absDiffMinutes}m`
			: `${absDiffMinutes}m ago`;
	}

	const diffHours = Math.round(diffSeconds / 3600);
	const absDiffHours = Math.abs(diffHours);
	if (absDiffHours < 24) {
		return diffHours >= 0 ? `in ${absDiffHours}h` : `${absDiffHours}h ago`;
	}

	const diffDays = Math.round(diffSeconds / 86400);
	const absDiffDays = Math.abs(diffDays);
	return diffDays >= 0 ? `in ${absDiffDays}d` : `${absDiffDays}d ago`;
}

export function RowHeader({
	fields,
	tableLabel,
}: {
	fields: ResolvedRowFields;
	tableLabel: string;
}) {
	const levelValue =
		fields.levelText ?? fields.severityText ?? fields.severityNumber ?? "UNKNOWN";
	const level = toDisplayText(levelValue).trim().toUpperCase() || "UNKNOWN";
	const timestampDate = parseDate(fields.timestamp);
	const timestamp = timestampDate
		? timestampDate.toLocaleString()
		: toDisplayText(fields.timestamp);
	const timeAgo = timestampDate
		? formatCompactTimeAgo(timestampDate)
		: "time unknown";
	const serviceName = toDisplayText(fields.serviceName);
	const hasServiceName = serviceName !== "—" && serviceName !== '""';
	const displayedServiceName = hasServiceName
		? serviceName
		: "no service detected";

	return (
		<div className="space-y-3 border-[color:var(--surface-border)] border-b px-5 py-4">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
					{tableLabel}
				</span>
			</div>
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<span
					className={cn(
						"inline-flex h-5 max-w-full items-center justify-center rounded border px-1.5 font-mono text-[11px] tabular-nums leading-none",
						getSeverityBadgeClass(level),
					)}
				>
					<span className="flex h-full translate-y-px items-center justify-center leading-none">
						{level}
					</span>
				</span>
				<span className="font-mono text-muted-foreground text-xs">-</span>
				<span className="min-w-0 font-mono text-foreground text-xs tabular-nums">
					{timestamp}
				</span>
				<span className="font-mono text-muted-foreground text-xs">-</span>
				<span className="font-mono text-foreground text-xs tabular-nums">
					{timeAgo}
				</span>
				<span className="font-mono text-muted-foreground text-xs">-</span>
				<span
					className={cn(
						"inline-flex h-5 max-w-full items-center gap-1 rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-background)] font-mono text-[11px] text-foreground leading-none",
						hasServiceName ? "pr-1 pl-2" : "px-2",
					)}
				>
					<span className="flex h-full items-center truncate leading-none">
						{displayedServiceName}
					</span>
					{hasServiceName ? (
						<CopyButton
							aria-label="Copy service name"
							onCopy={async () => {
								await navigator.clipboard.writeText(displayedServiceName);
							}}
							className="size-6 border border-transparent bg-transparent text-muted-foreground shadow-none hover:border-[color:var(--surface-border)] hover:bg-muted/40 hover:text-foreground"
							iconClassName="size-3"
						/>
					) : null}
				</span>
			</div>
		</div>
	);
}
