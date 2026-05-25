import {
	ChartBar,
	ChevronDown,
	ChevronRight,
	Eye,
	EyeOff,
	FilterX,
	Minus,
	Plus,
	Search,
} from "lucide-react";
import { useState } from "react";
import { SourceType } from "@/web/lib/source-types";
import { cn } from "@/web/utils/cn";
import type {
	DynamicFacetMode,
	DynamicFacetViewGroup,
} from "../-lib/logs-facets";
import type { LogsResultsView } from "../-lib/logs-patterns";

const LOG_LEVELS = [
	"FATAL",
	"CRITICAL",
	"ERROR",
	"WARN",
	"INFO",
	"DEBUG",
	"TRACE",
	"UNKNOWN",
];

function getSeverityTextClass(level: string) {
	switch (level) {
		case "TRACE":
			return "text-stone-500 dark:text-stone-400";
		case "DEBUG":
			return "text-blue-600 dark:text-blue-400";
		case "INFO":
			return "text-emerald-600 dark:text-emerald-400";
		case "WARN":
		case "WARNING":
			return "text-amber-600 dark:text-amber-500";
		case "CRITICAL":
			return "text-rose-600 dark:text-rose-400";
		case "ERROR":
			return "text-red-600 dark:text-red-400";
		case "FATAL":
			return "text-purple-600 dark:text-purple-400";
		case "UNKNOWN":
			return "text-stone-400 dark:text-stone-500 italic";
		default:
			return "text-stone-600 dark:text-stone-400";
	}
}

const filterItems = [{ label: "Denoise Results", value: "denoise" }];

const modeItems = [
	{
		value: "table" as const,
		label: "Table",
	},
	{
		value: "groups" as const,
		label: "Patterns",
	},
];

const SEARCHABLE_FACET_LABELS = new Set([
	"ServiceName",
	"SpanName",
	"SpanId",
	"TraceId",
]);

export function getLogsSidebarSections(sourceType: SourceType | null) {
	return {
		logLevel: sourceType === SourceType.Log,
		traceControls: sourceType === SourceType.Trace,
		spanName: sourceType === SourceType.Trace,
	};
}

function SectionHeader({ label }: { label: string }) {
	return (
		<h3 className="mb-2 flex items-center gap-1.5 font-normal text-[9px] text-stone-400 uppercase tracking-[0.16em] dark:text-stone-600">
			<span className="inline-block h-px w-3 bg-stone-300 dark:bg-stone-700" />
			{label}
		</h3>
	);
}

export function LogsSidebarPreview({
	className,
	sourceType = SourceType.Log,
	value = "table",
	activeFilters = [],
	isDenoisePanelVisible = true,
	isRootSpansOnly = false,
	selectedLevels = [],
	levelDistribution,
	showLevelDist = false,
	dynamicFacetGroups = [],
	hasDynamicFacetFilters = false,
	isDynamicFacetsLoading = false,
	dynamicFacetsError,
	onValueChange,
	onFilterToggle,
	onToggleDenoisePanel,
	onToggleRootSpansOnly,
	onLevelToggle,
	onClearLevels,
	onClearAllFilters,
	onToggleLevelDist,
	onDynamicFacetToggle,
	onDynamicFacetClear,
}: {
	className?: string;
	sourceType?: SourceType | null;
	value?: LogsResultsView;
	activeFilters?: string[];
	isDenoisePanelVisible?: boolean;
	isRootSpansOnly?: boolean;
	selectedLevels?: string[];
	levelDistribution?: { counts: Map<string, number>; total: number };
	showLevelDist?: boolean;
	dynamicFacetGroups?: DynamicFacetViewGroup[];
	hasDynamicFacetFilters?: boolean;
	isDynamicFacetsLoading?: boolean;
	dynamicFacetsError?: string | null;
	onValueChange?: (value: LogsResultsView) => void;
	onFilterToggle?: (filter: string) => void;
	onToggleDenoisePanel?: () => void;
	onToggleRootSpansOnly?: () => void;
	onLevelToggle?: (level: string) => void;
	onClearLevels?: () => void;
	onClearAllFilters?: () => void;
	onToggleLevelDist?: () => void;
	onDynamicFacetToggle?: (
		fieldId: string,
		value: string,
		mode: DynamicFacetMode,
	) => void;
	onDynamicFacetClear?: (fieldId: string) => void;
}) {
	const [isLogLevelExpanded, setIsLogLevelExpanded] = useState(false);
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
		{},
	);
	const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>(
		{},
	);
	const [optionSearch, setOptionSearch] = useState<Record<string, string>>({});
	const sections = getLogsSidebarSections(sourceType);
	const collapseAllFilters = () => {
		setIsLogLevelExpanded(false);
		setExpandedGroups({});
		setExpandedFields({});
	};
	const hasActiveFilters =
		activeFilters.length > 0 ||
		selectedLevels.length > 0 ||
		hasDynamicFacetFilters ||
		isRootSpansOnly;

	return (
		<aside
			className={cn("flex h-full flex-col bg-background text-sm", className)}
		>
			<div className="logs-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">
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
					<div className="mb-2 flex items-center justify-between gap-2">
						<h3 className="flex items-center gap-1.5 font-normal text-[9px] text-stone-400 uppercase tracking-[0.16em] dark:text-stone-600">
							<span className="inline-block h-px w-3 bg-stone-300 dark:bg-stone-700" />
							Filters
						</h3>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={collapseAllFilters}
								className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
								title="Collapse all filters"
							>
								<Minus className="size-3.5" />
							</button>
							{hasActiveFilters ? (
								<button
									type="button"
									onClick={onClearAllFilters}
									className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
									title="Clear all filters"
								>
									<FilterX className="size-3.5" />
								</button>
							) : null}
						</div>
					</div>
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
										<div className="flex w-3.5 items-center justify-center">
											<span
												className={cn(
													"h-1.5 w-1.5 rounded-full transition-all",
													isActive
														? "bg-[#f6821f] shadow-[0_0_6px_#f6821f]"
														: "bg-stone-300 shadow-inner dark:bg-stone-700",
												)}
											/>
										</div>
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
											className="mr-1 rounded-sm p-1 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
											title={
												isDenoisePanelVisible
													? "Hide removed patterns panel"
													: "Show removed patterns panel"
											}
										>
											{isDenoisePanelVisible ? (
												<EyeOff className="size-3.5" />
											) : (
												<Eye className="size-3.5" />
											)}
										</button>
									)}
								</div>
							);
						})}

						{sections.traceControls ? (
							<>
								<button
									type="button"
									onClick={onToggleRootSpansOnly}
									className={cn(
										"flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors",
										isRootSpansOnly
											? "bg-[#f6821f0c] text-stone-900 dark:bg-[#f6821f0a] dark:text-stone-100"
											: "text-stone-600 hover:bg-stone-100/70 dark:text-stone-400 dark:hover:bg-stone-900/60",
									)}
								>
									<span
										className={cn(
											"h-1.5 w-1.5 rounded-full",
											isRootSpansOnly
												? "bg-[#f6821f]"
												: "bg-stone-300 dark:bg-stone-700",
										)}
									/>
									<span className="font-bold">Root spans only</span>
								</button>
								<button
									type="button"
									disabled
									className="flex w-full cursor-not-allowed items-center gap-1.5 rounded px-2 py-1.5 text-left text-stone-400 text-xs opacity-70 dark:text-stone-600"
								>
									<span className="h-1.5 w-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
									<span className="font-bold">Event Deltas</span>
								</button>
							</>
						) : null}

						{sections.logLevel ? (
							<div className="flex flex-col py-1">
								<div className="flex items-center justify-between px-2 py-1">
									<button
										type="button"
										onClick={() => setIsLogLevelExpanded(!isLogLevelExpanded)}
										className="flex flex-1 items-center gap-1.5 text-left"
									>
										{isLogLevelExpanded ? (
											<ChevronDown className="size-3.5 text-stone-500" />
										) : (
											<ChevronRight className="size-3.5 text-stone-500" />
										)}
										<span className="font-bold text-stone-600 text-xs transition-colors dark:text-stone-400">
											Log Level{" "}
											{selectedLevels.length > 0
												? `(${selectedLevels.length})`
												: ""}
										</span>
									</button>
									<div className="flex items-center gap-1">
										{selectedLevels.length > 0 && (
											<button
												type="button"
												onClick={onClearLevels}
												className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
												title="Clear Filters"
											>
												<FilterX className="size-3.5" />
											</button>
										)}
										<button
											type="button"
											onClick={onToggleLevelDist}
											className={cn(
												"rounded p-1 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300",
												showLevelDist &&
													"bg-[#f6821f0c] text-[#f6821f] dark:bg-[#f6821f0a] dark:text-[#f6821f]",
											)}
											title={
												showLevelDist
													? "Hide Distribution"
													: "Show Distribution"
											}
										>
											<ChartBar className="size-3.5" />
										</button>
									</div>
								</div>

								{isLogLevelExpanded && (
									<div className="mt-1 flex flex-col gap-0.5 px-2">
										{LOG_LEVELS.map((level) => {
											const isSelected = selectedLevels.includes(level);
											const count = levelDistribution?.counts.get(level) || 0;
											const total = levelDistribution?.total || 1;
											const percentage =
												count > 0 ? ((count / total) * 100).toFixed(1) : "0.0";

											return (
												<button
													key={level}
													type="button"
													onClick={() => onLevelToggle?.(level)}
													className={cn(
														"group flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-all",
														isSelected
															? "bg-[#f6821f0c] dark:bg-[#f6821f0a]"
															: "hover:bg-stone-100/70 dark:hover:bg-stone-900/60",
													)}
												>
													<div className="flex items-center gap-1.5">
														<span
															className={cn(
																"h-1.5 w-1.5 rounded-full transition-all",
																isSelected
																	? "bg-[#f6821f] shadow-[0_0_6px_#f6821f]"
																	: "bg-stone-300 shadow-inner dark:bg-stone-700",
															)}
														/>
														<span
															className={cn(
																"font-bold font-mono text-xs",
																getSeverityTextClass(level),
															)}
														>
															{level === "UNKNOWN" ? "EMPTY/UNKNOWN" : level}
														</span>
													</div>
													{showLevelDist && (
														<span className="font-mono text-[10px] text-stone-500">
															{percentage}%
														</span>
													)}
												</button>
											);
										})}
									</div>
								)}
							</div>
						) : null}

						{isDynamicFacetsLoading ? (
							<div className="px-2 py-2 text-stone-500 text-xs">
								Loading filters...
							</div>
						) : dynamicFacetsError ? (
							<div className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-amber-700 text-xs dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400">
								{dynamicFacetsError}
							</div>
						) : dynamicFacetGroups.length === 0 ? (
							<div className="px-2 py-2 text-stone-500 text-xs">
								No dynamic filters available.
							</div>
						) : (
							dynamicFacetGroups.map((group) => {
								const isGroupExpanded = expandedGroups[group.id] ?? false;
								const selectedCount = group.fields.reduce(
									(sum, field) =>
										sum +
										field.options.filter(
											(option) => option.included || option.excluded,
										).length,
									0,
								);

								return (
									<div key={group.id} className="rounded">
										<button
											type="button"
											onClick={() =>
												setExpandedGroups((current) => ({
													...current,
													[group.id]: !isGroupExpanded,
												}))
											}
											className={cn(
												"flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors",
												selectedCount > 0
													? "bg-[#f6821f0c] text-stone-900 dark:bg-[#f6821f0a] dark:text-stone-100"
													: "text-stone-600 hover:bg-stone-100/70 dark:text-stone-400 dark:hover:bg-stone-900/60",
											)}
										>
											{isGroupExpanded ? (
												<ChevronDown className="size-3.5 shrink-0 text-stone-500" />
											) : (
												<ChevronRight className="size-3.5 shrink-0 text-stone-500" />
											)}
											<span className="min-w-0 flex-1 truncate font-bold text-stone-600 dark:text-stone-400">
												{group.label}
											</span>
											{selectedCount > 0 ? (
												<span className="font-mono text-[#f6821f] text-[10px]">
													{selectedCount}
												</span>
											) : null}
										</button>
										{isGroupExpanded ? (
											<div className="ml-3 flex flex-col border-stone-200 border-l pl-2 dark:border-stone-800">
												{group.fields.map((field) => {
													const fieldExpanded =
														group.fields.length === 1 ||
														(expandedFields[field.id] ?? false);
													const fieldSearch = optionSearch[field.id] ?? "";
													const hasSearch = SEARCHABLE_FACET_LABELS.has(
														field.label,
													);
													const filteredOptions = field.options.filter(
														(option) =>
															fieldSearch.trim()
																? option.value
																		.toLowerCase()
																		.includes(fieldSearch.trim().toLowerCase())
																: true,
													);

													return (
														<div key={field.id} className="py-0.5">
															{group.fields.length > 1 ? (
																<div className="flex items-center gap-1">
																	<button
																		type="button"
																		onClick={() =>
																			setExpandedFields((current) => ({
																				...current,
																				[field.id]: !fieldExpanded,
																			}))
																		}
																		className={cn(
																			"flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors",
																			field.options.some(
																				(option) =>
																					option.included || option.excluded,
																			)
																				? "bg-[#f6821f0c] text-stone-900 dark:bg-[#f6821f0a] dark:text-stone-100"
																				: "text-stone-600 hover:bg-stone-100/70 dark:text-stone-400 dark:hover:bg-stone-900/60",
																		)}
																	>
																		{fieldExpanded ? (
																			<ChevronDown className="size-3 shrink-0 text-stone-500" />
																		) : (
																			<ChevronRight className="size-3 shrink-0 text-stone-500" />
																		)}
																		<span className="truncate font-bold">
																			{field.label}
																		</span>
																	</button>
																	{field.options.some(
																		(option) =>
																			option.included || option.excluded,
																	) ? (
																		<button
																			type="button"
																			onClick={() =>
																				onDynamicFacetClear?.(field.id)
																			}
																			className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
																			title="Clear field filters"
																		>
																			<FilterX className="size-3" />
																		</button>
																	) : null}
																</div>
															) : null}
															{fieldExpanded ? (
																<div className="flex flex-col gap-0.5 py-1">
																	{hasSearch ? (
																		<label className="relative mb-1 block">
																			<Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-stone-400" />
																			<input
																				value={fieldSearch}
																				onChange={(event) =>
																					setOptionSearch((current) => ({
																						...current,
																						[field.id]: event.target.value,
																					}))
																				}
																				placeholder={`Search ${field.label}`}
																				className="h-7 w-full rounded border border-stone-200 bg-transparent pr-2 pl-7 font-mono text-[11px] outline-none transition-colors focus:border-[#f6821f] dark:border-stone-800"
																			/>
																		</label>
																	) : null}
																	{filteredOptions.map((option) => (
																		<div
																			key={option.value}
																			className={cn(
																				"group flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
																				option.included &&
																					"bg-[#f6821f0c] dark:bg-[#f6821f0a]",
																				option.excluded &&
																					"bg-rose-500/10 dark:bg-rose-500/10",
																				!option.included &&
																					!option.excluded &&
																					"hover:bg-stone-100/70 dark:hover:bg-stone-900/60",
																			)}
																		>
																			<button
																				type="button"
																				onClick={() =>
																					onDynamicFacetToggle?.(
																						field.id,
																						option.value,
																						"include",
																					)
																				}
																				className={cn(
																					"rounded p-0.5 text-stone-400 transition-colors hover:bg-stone-200 hover:text-[#f6821f] dark:hover:bg-stone-800",
																					option.included && "text-[#f6821f]",
																				)}
																				title="Include value"
																			>
																				<Plus className="size-3" />
																			</button>
																			<button
																				type="button"
																				onClick={() =>
																					onDynamicFacetToggle?.(
																						field.id,
																						option.value,
																						"exclude",
																					)
																				}
																				className={cn(
																					"rounded p-0.5 text-stone-400 transition-colors hover:bg-stone-200 hover:text-rose-500 dark:hover:bg-stone-800",
																					option.excluded && "text-rose-500",
																				)}
																				title="Exclude value"
																			>
																				<Minus className="size-3" />
																			</button>
																			<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-stone-600 dark:text-stone-400">
																				{option.value}
																			</span>
																			<span className="font-mono text-[10px] text-stone-400">
																				{option.count}
																			</span>
																		</div>
																	))}
																</div>
															) : null}
														</div>
													);
												})}
											</div>
										) : null}
									</div>
								);
							})
						)}
					</div>
				</div>
			</div>
		</aside>
	);
}
