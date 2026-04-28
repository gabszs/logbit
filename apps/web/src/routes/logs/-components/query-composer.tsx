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
import { TimeRangeSelect } from "./time-range-select";

export function QueryComposer({
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
}) {
	return (
		<div className="space-y-1">
			<div className="grid gap-1.5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,0.85fr)]">
				<div className="flex h-8 min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background/70">
					<div className="flex h-8 items-center border-border/70 border-r bg-background/70 px-3 font-mono text-foreground text-sm leading-none">
						SELECT
					</div>
					<Input
						value={selectQuery}
						onChange={(event) => onSelectQueryChange(event.target.value)}
						className="!py-0 h-8 flex-1 rounded-none border-0 bg-transparent font-mono text-sm leading-none shadow-none focus-visible:ring-0"
						placeholder="Timestamp, ServiceName as service, SeverityText as level, Body"
					/>
				</div>
				<div className="flex h-8 min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background/70">
					<div className="flex h-8 items-center border-border/70 border-r bg-background/70 px-3 font-mono text-foreground text-sm leading-none">
						ORDER BY
					</div>
					<Input
						value={orderByQuery}
						onChange={(event) => onOrderByQueryChange(event.target.value)}
						className="!py-0 h-8 flex-1 rounded-none border-0 bg-transparent font-mono text-sm leading-none shadow-none focus-visible:ring-0"
						placeholder="(TimestampTime, Timestamp) DESC"
					/>
				</div>
			</div>

			<div className="grid items-stretch gap-1.5 xl:grid-cols-[minmax(0,1.9fr)_minmax(8rem,0.65fr)_auto]">
				<div className="flex h-8 min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background/70">
					<div className="flex items-stretch border-border/70 border-r bg-background/70">
						<Select
							value={mode}
							onValueChange={(value) => onModeChange(value as "sql" | "lucene")}
						>
							<SelectTrigger
								size="sm"
								className="w-28 rounded-none border-0 bg-background/70 font-mono text-foreground text-sm leading-none shadow-none"
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
						className="!py-0 h-8 flex-1 rounded-none border-0 bg-transparent font-mono text-sm leading-none shadow-none focus-visible:ring-0"
						placeholder="WHERE SQL clause (ex. column = 'foo')"
					/>
				</div>
				<div className="flex items-stretch">
					<TimeRangeSelect
						value={timeRange}
						onValueChange={onTimeRangeChange}
					/>
				</div>
				<div className="flex items-stretch">
					<Button
						type="button"
						onClick={onRun}
						disabled={disabled || isRunning}
						className="h-8 min-w-24"
					>
						<Play className="size-4" />
						{isRunning ? "Running…" : "Run"}
					</Button>
				</div>
			</div>
		</div>
	);
}
