import { cn } from "@/web/utils/cn";
import { ArrowRight, Eye, EyeOff, Plus, Sparkles, Waves } from "lucide-react";
import type { ReactNode } from "react";
import type { LogsResultsView } from "../-lib/logs-patterns";

const presetItems = [
	"LLMs in series",
	"LLMs in parallel",
	"Capacitor: memory",
	"Capacitor: style inject",
];

const filterItems = [
	{ label: "Denoise Results", value: "denoise" },
];

const memoryItems = ["Scratchpad", "Style guide", "Code review"];

const modeItems = [
	{
		value: "table" as const,
		label: "Table",
	},
	{
		value: "groups" as const,
		label: "Groups",
	},
];

function SectionHeader({ label }: { label: string }) {
	return (
		<h3 className="mb-2 flex items-center gap-1.5 font-normal text-[9px] text-stone-400 uppercase tracking-[0.16em] dark:text-stone-600">
			<span className="inline-block h-px w-3 bg-stone-300 dark:bg-stone-700" />
			{label}
		</h3>
	);
}

function DisabledRow({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			disabled
			className={cn(
				"flex w-full cursor-not-allowed items-center rounded px-2 py-1.5 text-left text-xs opacity-70 transition-colors",
				className,
			)}
		>
			{children}
		</button>
	);
}

export function LogsSidebarPreview({
	className,
	value = "table",
	activeFilters = [],
	isDenoisePanelVisible = true,
	onValueChange,
	onFilterToggle,
	onToggleDenoisePanel,
}: {
	className?: string;
	value?: LogsResultsView;
	activeFilters?: string[];
	isDenoisePanelVisible?: boolean;
	onValueChange?: (value: LogsResultsView) => void;
	onFilterToggle?: (filter: string) => void;
	onToggleDenoisePanel?: () => void;
}) {
	return (
		<aside
			className={cn(
				"flex h-full flex-col bg-[color:var(--surface-background)] text-sm",
				className,
			)}
		>
			<div className="flex-1 px-3.5 py-3.5">
				<div className="space-y-2.5">
					<SectionHeader label="Mode" />
					<div className="flex flex-col gap-1">
						{modeItems.map((item) => (
							<button
								key={item.label}
								type="button"
								onClick={() => onValueChange?.(item.value)}
								className={cn(
									"w-full rounded border px-2 py-2 text-left transition-colors",
									value === item.value
										? "border-[#f6821f] bg-[#f6821f0c] dark:bg-[#f6821f0a]"
										: "border-transparent hover:bg-stone-100/70 dark:hover:bg-stone-900/60",
								)}
							>
								<div className="flex items-center gap-1.5">
									<span
										className={cn(
											"h-1.5 w-1.5 rounded-full transition-colors",
											value === item.value
												? "bg-[#f6821f]"
												: "bg-stone-300 dark:bg-stone-700",
										)}
									/>
									<span
										className={cn(
											"font-bold text-xs",
											value === item.value
												? "text-stone-900 dark:text-stone-100"
												: "text-stone-600 dark:text-stone-400",
										)}
									>
										{item.label}
									</span>
								</div>
							</button>
						))}
					</div>
				</div>

				<div className="logs-surface-divider mt-2.5 pt-2.5">
					<SectionHeader label="Filters" />
					<div className="flex flex-col gap-1">
						{filterItems.map((item) => {
							const isActive = activeFilters.includes(item.value);
							return (
								<div
									key={item.label}
									className={cn(
										"flex w-full items-center justify-between rounded px-1 py-1 transition-all",
										isActive
											? "bg-[#f6821f0c] dark:bg-[#f6821f0a]"
											: "hover:bg-stone-100/70 dark:hover:bg-stone-900/60",
									)}
								>
									<button
										type="button"
										onClick={() => onFilterToggle?.(item.value)}
										className="flex flex-1 items-center gap-1.5 px-1 py-1 text-left"
									>
										<span
											className={cn(
												"h-1.5 w-1.5 rounded-full transition-all",
												isActive
													? "bg-[#f6821f] shadow-[0_0_6px_#f6821f]"
													: "bg-stone-300 shadow-inner dark:bg-stone-700",
											)}
										/>
										<span
											className={cn(
												"font-bold text-xs transition-colors",
												isActive
													? "text-stone-900 dark:text-stone-100"
													: "text-stone-600 dark:text-stone-400",
											)}
										>
											{item.label}
										</span>
									</button>
									{isActive && item.value === "denoise" && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onToggleDenoisePanel?.();
											}}
											className="mr-1 rounded-sm p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors dark:hover:bg-stone-800 dark:hover:text-stone-300"
											title={isDenoisePanelVisible ? "Hide removed patterns panel" : "Show removed patterns panel"}
										>
											{isDenoisePanelVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
										</button>
									)}
								</div>
							);
						})}
					</div>
				</div>

				<div className="logs-surface-divider mt-2.5 pt-2.5">
					<SectionHeader label="Canvas" />
					<DisabledRow className="text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100">
						<Plus className="mr-1.5 size-3.5 shrink-0 text-stone-300 dark:text-stone-700" />
						<span>New canvas</span>
					</DisabledRow>
					<DisabledRow className="text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100">
						<ArrowRight className="mr-1.5 size-3.5 shrink-0 text-stone-300 dark:text-stone-700" />
						<span>Share link</span>
					</DisabledRow>
					<DisabledRow className="text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-600 dark:hover:bg-stone-900 dark:hover:text-rose-400">
						<Sparkles className="mr-1.5 size-3.5 shrink-0" />
						<span>Reset</span>
					</DisabledRow>
				</div>

				<div className="logs-surface-divider mt-2.5 pt-2.5">
					<SectionHeader label="Presets" />
					<div className="flex flex-col gap-0.5">
						{presetItems.map((item) => (
							<DisabledRow
								key={item}
								className="group text-stone-600 hover:bg-orange-50 hover:text-[#f6821f] dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-[#f6821f]"
							>
								<span className="mr-1.5 text-stone-300 transition-colors group-hover:text-[#f6821f] dark:text-stone-700">
									→
								</span>
								<span>{item}</span>
							</DisabledRow>
						))}
					</div>
				</div>



				<div className="logs-surface-divider mt-2.5 pt-2.5">
					<SectionHeader label="Capacitance / Memory" />
					<div className="flex flex-col gap-0.5">
						{memoryItems.map((item) => (
							<DisabledRow
								key={item}
								className="justify-start text-stone-600 hover:bg-sky-50 hover:text-sky-700 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-sky-400"
							>
								<span className="mr-1 text-sky-400 opacity-60">⊓</span>
								<span>{item}</span>
							</DisabledRow>
						))}
					</div>
				</div>

				<div className="logs-surface-divider mt-2.5 pt-2.5">
					<SectionHeader label="Inductance / Stability" />
					<div className="flex flex-col gap-0.5">
						<DisabledRow className="justify-start text-stone-600 hover:bg-violet-50 hover:text-violet-700 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-violet-400">
							<Waves className="mr-1 size-3.5 shrink-0 text-violet-400 opacity-60" />
							<span>Inductor</span>
						</DisabledRow>
					</div>
				</div>

			</div>
		</aside>
	);
}
