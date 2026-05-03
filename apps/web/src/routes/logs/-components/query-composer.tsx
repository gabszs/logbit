import { Play } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { cn } from "@/web/utils/cn";
import { TimeRangeSelect } from "./time-range-select";

export function QueryComposer({
	className,
	mode,
	selectQuery,
	whereQuery,
	orderByQuery,
	timeRange,
	onModeChange,
	onSelectQueryChange,
	onWhereQueryChange,
	onOrderByQueryChange,
	onTimeRangeChange,
	onRun,
	disabled,
	isRunning,
}: {
	mode: "sql" | "lucene";
	selectQuery: string;
	whereQuery: string;
	orderByQuery: string;
	timeRange: Parameters<typeof TimeRangeSelect>[0]["value"];
	onModeChange: (value: "sql" | "lucene") => void;
	onSelectQueryChange: (value: string) => void;
	onWhereQueryChange: (value: string) => void;
	onOrderByQueryChange: (value: string) => void;
	onTimeRangeChange: (
		value: Parameters<typeof TimeRangeSelect>[0]["value"],
	) => void;
	onRun: () => void;
	disabled: boolean;
	isRunning: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"space-y-3 border-[color:var(--surface-border)] border-b bg-[color:var(--surface-background)]/92 px-4 py-4 backdrop-blur-sm sm:px-5 lg:px-6",
				className,
			)}
		>
			<div className="grid gap-2 xl:grid-cols-[minmax(0,2.2fr)_minmax(18rem,0.9fr)]">
				<div className="flex h-10 min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-[#faf9f6] dark:border-stone-800 dark:bg-stone-950">
					<div className="flex h-8 items-center border-stone-200 border-r bg-[#faf9f6] px-3 font-mono text-foreground text-sm leading-none dark:border-stone-800 dark:bg-stone-950">
						SELECT
					</div>
					<Input
						value={selectQuery}
						onChange={(event) => onSelectQueryChange(event.target.value)}
						className="h-10 flex-1 rounded-none border-0 bg-transparent py-0 font-mono text-sm leading-none shadow-none focus-visible:ring-0"
						placeholder="Timestamp, ServiceName as service, SeverityText as level, Body"
					/>
				</div>

				<div className="flex h-10 min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-[#faf9f6] dark:border-stone-800 dark:bg-stone-950">
					<div className="flex h-10 items-center border-stone-200 border-r bg-[#faf9f6] px-3 font-mono text-foreground text-sm leading-none dark:border-stone-800 dark:bg-stone-950">
						ORDER BY
					</div>
					<Input
						value={orderByQuery}
						onChange={(event) => onOrderByQueryChange(event.target.value)}
						className="h-10 flex-1 rounded-none border-0 bg-transparent py-0 font-mono text-sm leading-none shadow-none focus-visible:ring-0"
						placeholder="(TimestampTime, Timestamp) DESC"
					/>
				</div>
			</div>

			<div className="grid items-stretch gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)_auto]">
				<div className="flex h-10 min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-[#faf9f6] dark:border-stone-800 dark:bg-stone-950">
					<div className="flex items-stretch border-stone-200 border-r bg-[#faf9f6] dark:border-stone-800 dark:bg-stone-950">
						<Select
							value={mode}
							onValueChange={(value) => onModeChange(value as "sql" | "lucene")}
						>
							<SelectTrigger
								size="sm"
								className="h-10 w-28 rounded-none border-0 bg-[#faf9f6] font-mono text-foreground text-sm leading-none shadow-none dark:bg-stone-950"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="sql">SQL</SelectItem>
								<SelectItem value="lucene" disabled>
									Lucene
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<Input
						value={whereQuery}
						onChange={(event) => onWhereQueryChange(event.target.value)}
						className="h-10 flex-1 rounded-none border-0 bg-transparent py-0 font-mono text-sm leading-none shadow-none focus-visible:ring-0"
						placeholder="WHERE SQL clause (ex. column = 'foo')"
					/>
				</div>

				<div className="flex min-w-0 items-stretch">
					<TimeRangeSelect
						value={timeRange}
						onValueChange={onTimeRangeChange}
					/>
				</div>

				<div className="flex items-stretch xl:justify-end">
					<Button
						type="button"
						onClick={onRun}
						disabled={disabled || isRunning}
						size="sm"
						className="h-10 min-w-24 rounded-lg px-5"
					>
						<Play className="size-4" />
						{isRunning ? "Running…" : "Run"}
					</Button>
				</div>
			</div>
		</div>
	);
}
