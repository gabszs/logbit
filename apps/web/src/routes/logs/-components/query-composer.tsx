import { Check, ChevronDown, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { cn } from "@/web/utils/cn";
import { TimeRangeSelect } from "./time-range-select";

export type AutoRefreshInterval = "off" | "10s" | "30s" | "60s";

const AUTO_REFRESH_OPTIONS: Array<{
	value: AutoRefreshInterval;
	label: string;
}> = [
	{ value: "off", label: "Off" },
	{ value: "10s", label: "10 sec" },
	{ value: "30s", label: "30 sec" },
	{ value: "60s", label: "60 sec" },
];

function ExpandableQueryField({
	value,
	onChange,
	placeholder,
	label,
	prefix,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	label?: string;
	prefix?: ReactNode;
	className?: string;
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		if (!isExpanded) {
			textarea.style.height = "";
			return;
		}

		textarea.style.height = "auto";
		textarea.style.height = `${textarea.scrollHeight}px`;
	}, [isExpanded, value]);

	return (
		<div
			className={cn(
				"flex min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-[#faf9f6] transition-[min-height,box-shadow,border-color] duration-150 dark:border-stone-800 dark:bg-stone-950",
				isExpanded
					? "min-h-10 border-[#f6821f] shadow-[inset_0_-1px_0_#f6821f]"
					: "h-10",
				className,
			)}
		>
			{label ? (
				<div className="flex shrink-0 items-start border-stone-200 border-r bg-[#faf9f6] dark:border-stone-800 dark:bg-stone-950">
					<div className="flex h-10 items-center px-3 font-mono text-foreground text-sm leading-none">
						{label}
					</div>
				</div>
			) : null}
			{prefix}
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onFocus={() => setIsExpanded(true)}
				onBlur={() => setIsExpanded(false)}
				rows={1}
				wrap={isExpanded ? "soft" : "off"}
				autoCapitalize="off"
				autoComplete="off"
				autoCorrect="off"
				data-enable-grammarly="false"
				data-gramm="false"
				data-gramm_editor="false"
				data-lt-active="false"
				data-ms-editor="false"
				spellCheck={false}
				className={cn(
					"min-h-10 min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-[11px] font-mono text-sm leading-[18px] shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0",
					isExpanded
						? "overflow-hidden whitespace-pre-wrap"
						: "overflow-hidden whitespace-nowrap",
				)}
				placeholder={placeholder}
			/>
		</div>
	);
}

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
	autoRefreshInterval,
	onAutoRefreshIntervalChange,
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
	autoRefreshInterval: AutoRefreshInterval;
	onAutoRefreshIntervalChange: (value: AutoRefreshInterval) => void;
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
				<ExpandableQueryField
					label="SELECT"
					value={selectQuery}
					onChange={onSelectQueryChange}
					placeholder="Timestamp, ServiceName as service, SeverityText as level, Body"
				/>

				<ExpandableQueryField
					label="ORDER BY"
					value={orderByQuery}
					onChange={onOrderByQueryChange}
					placeholder="(TimestampTime, Timestamp) DESC"
				/>
			</div>

			<div className="grid items-stretch gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)_auto]">
				<ExpandableQueryField
					value={whereQuery}
					onChange={onWhereQueryChange}
					placeholder="WHERE SQL clause (ex. column = 'foo')"
					prefix={
						<div className="flex shrink-0 items-stretch border-stone-200 border-r bg-[#faf9f6] dark:border-stone-800 dark:bg-stone-950">
							<Select
								value={mode}
								onValueChange={(value) =>
									onModeChange(value as "sql" | "lucene")
								}
							>
								<SelectTrigger className="h-10 w-28 items-center rounded-none border-0 bg-[#faf9f6] font-mono text-foreground text-sm leading-none shadow-none dark:bg-stone-950">
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
					}
				/>

				<div className="flex h-10 min-w-0 items-stretch">
					<TimeRangeSelect
						value={timeRange}
						onValueChange={onTimeRangeChange}
					/>
				</div>

				<div className="flex items-stretch xl:justify-end">
					<DropdownMenu>
						<div className="flex h-10 overflow-hidden rounded-lg border border-stone-500/60 bg-stone-700/60 text-stone-100 shadow-none">
							<button
								type="button"
								onClick={onRun}
								disabled={disabled || isRunning}
								className="flex h-10 min-w-10 items-center justify-center px-3 transition-colors hover:bg-stone-600/80 disabled:cursor-not-allowed disabled:opacity-50"
								aria-label="Refresh query"
							>
								<RefreshCw
									className={cn("size-4", isRunning && "animate-spin")}
								/>
							</button>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									disabled={disabled}
									className="flex h-10 w-10 items-center justify-center border-stone-500/60 border-l transition-colors hover:bg-stone-600/80 disabled:cursor-not-allowed disabled:opacity-50"
									aria-label="Auto refresh options"
								>
									<ChevronDown className="size-4" />
								</button>
							</DropdownMenuTrigger>
						</div>
						<DropdownMenuContent
							align="end"
							className="min-w-40 border-stone-700 bg-stone-900 p-1 text-stone-100"
						>
							{AUTO_REFRESH_OPTIONS.map((option) => (
								<DropdownMenuItem
									key={option.value}
									onClick={() => {
										onAutoRefreshIntervalChange(option.value);
									}}
									className="rounded-md text-sm focus:bg-stone-800 focus:text-stone-100"
								>
									{option.label}
									<DropdownMenuShortcut className="ml-auto text-stone-100">
										{autoRefreshInterval === option.value ? (
											<Check className="size-4" />
										) : null}
									</DropdownMenuShortcut>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}
