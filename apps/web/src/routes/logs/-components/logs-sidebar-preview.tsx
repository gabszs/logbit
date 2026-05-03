import { ArrowRight, Plus, Sparkles, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/web/utils/cn";

const presetItems = [
	"LLMs in series",
	"LLMs in parallel",
	"Capacitor: memory",
	"Capacitor: style inject",
];

const modelItems = [
	{ label: "@cf/meta/llama-3.1-8b-instruct", value: "8B" },
	{ label: "@cf/qwen/qwq-32b", value: "32B" },
	{ label: "@cf/mistralai/mistral-small-3.1-24b-instruct", value: "24B" },
];

const memoryItems = ["Scratchpad", "Style guide", "Code review"];

const modeItems = [
	{
		label: "Physics-faithful",
		blurb: "Resistance ∝ params. Parallel splits token budget by 1/R.",
		active: true,
	},
	{
		label: "Refine / Vote",
		blurb: "Series refines prior answer. Parallel branches vote for consensus.",
		active: false,
	},
	{
		label: "Chain / Ensemble",
		blurb: "Series chains output. Parallel synthesizes via judge.",
		active: false,
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

export function LogsSidebarPreview({ className }: { className?: string }) {
	return (
		<aside className={cn("logs-surface p-3.5 text-sm", className)}>
			<div className="space-y-2.5">
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
				<SectionHeader label="Resistance / LLM" />
				<div className="flex flex-col gap-0.5">
					{modelItems.map((item) => (
						<DisabledRow
							key={item.label}
							className="group justify-between text-stone-600 hover:bg-orange-50 dark:text-stone-400 dark:hover:bg-stone-900"
						>
							<span className="min-w-0 flex-1 truncate">
								<span className="mr-1 opacity-50 transition-opacity group-hover:opacity-100">
									⊡
								</span>
								{item.label}
							</span>
							<span className="text-[10px] text-stone-400 tabular-nums transition-colors group-hover:text-[#f6821f] dark:text-stone-600">
								{item.value}Ω
							</span>
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

			<div className="logs-surface-divider mt-2.5 pt-2.5">
				<SectionHeader label="Mode" />
				<div className="flex flex-col gap-1">
					{modeItems.map((item) => (
						<button
							key={item.label}
							type="button"
							disabled
							className={cn(
								"w-full rounded border px-2 py-2 text-left transition-colors",
								item.active
									? "border-[#f6821f] bg-[#f6821f0c] dark:bg-[#f6821f0a]"
									: "border-transparent",
							)}
						>
							<div className="flex items-center gap-1.5">
								<span
									className={cn(
										"h-1.5 w-1.5 rounded-full transition-colors",
										item.active
											? "bg-[#f6821f]"
											: "bg-stone-300 dark:bg-stone-700",
									)}
								/>
								<span
									className={cn(
										"font-bold text-xs",
										item.active
											? "text-stone-900 dark:text-stone-100"
											: "text-stone-600 dark:text-stone-400",
									)}
								>
									{item.label}
								</span>
							</div>
							<div className="mt-0.5 pl-3 text-[10px] text-stone-400 leading-snug dark:text-stone-600">
								{item.blurb}
							</div>
						</button>
					))}
				</div>
			</div>
		</aside>
	);
}
