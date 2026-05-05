import { ChevronDown, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { cn } from "@/web/utils/cn";
import type { RowPanelAttribute, RowPanelOverview } from "./types";
import { toDisplayText } from "./value-formatting";

function isEmptyDisplayValue(value: unknown) {
	return value == null || String(value).trim().length === 0;
}

function AttributeChip({ attribute }: { attribute: RowPanelAttribute }) {
	const value = toDisplayText(attribute.value);
	const tooltipValue =
		value.length > 600 ? `${value.slice(0, 600).trimEnd()}...` : value;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded border border-[color:var(--surface-border)] bg-muted/30 px-2 font-mono text-[11px] leading-none">
					<span className="max-w-[12rem] shrink-0 truncate text-muted-foreground">
						{attribute.key}
					</span>
					<span className="shrink-0 text-muted-foreground">:</span>
					<span className="min-w-0 max-w-[24rem] truncate text-foreground">
						{value}
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent
				sideOffset={6}
				className="max-w-[32rem] whitespace-pre-wrap break-words font-mono text-xs"
			>
				<span className="text-muted-foreground">{attribute.key}: </span>
				{tooltipValue}
			</TooltipContent>
		</Tooltip>
	);
}

export function OverviewSection({ overview }: { overview: RowPanelOverview }) {
	const [openSections, setOpenSections] = useState<Set<string>>(
		() => new Set(overview.sections.map((section) => section.id)),
	);

	useEffect(() => {
		setOpenSections(new Set(overview.sections.map((section) => section.id)));
	}, [overview]);

	const toggleSection = (sectionId: string) => {
		setOpenSections((previous) => {
			const next = new Set(previous);
			if (next.has(sectionId)) {
				next.delete(sectionId);
			} else {
				next.add(sectionId);
			}
			return next;
		});
	};

	return (
		<section className="min-h-0 flex-1 px-5 py-4">
			<div className="space-y-3">
				{overview.sections.map((section) => {
					const isOpen = openSections.has(section.id);
					const visibleAttributes = section.attributes.filter(
						(attribute) => !isEmptyDisplayValue(attribute.value),
					);

					return (
						<div
							key={section.id}
							className="overflow-hidden rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-background)]"
						>
							<button
								type="button"
								className="flex h-10 w-full items-center justify-between gap-3 border-[color:var(--surface-border)] border-b bg-muted/25 px-3 text-left"
								onClick={() => toggleSection(section.id)}
								aria-expanded={isOpen}
							>
								<span className="flex min-w-0 items-center gap-2">
									<ChevronDown
										className={cn(
											"size-4 shrink-0 text-muted-foreground transition-transform",
											!isOpen && "-rotate-90",
										)}
									/>
									<Tags className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate font-medium text-foreground text-sm">
										{section.title}
									</span>
								</span>
								<span className="shrink-0 rounded border border-[color:var(--surface-border)] bg-[color:var(--surface-background)] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
									{visibleAttributes.length}
								</span>
							</button>
							{isOpen ? (
								<div className="px-3 py-3">
									{visibleAttributes.length > 0 ? (
										<div className="flex max-w-full flex-wrap gap-1.5">
											{visibleAttributes.map((attribute) => (
												<AttributeChip
													key={`${section.id}:${attribute.key}`}
													attribute={attribute}
												/>
											))}
										</div>
									) : (
										<div className="flex min-h-20 items-center justify-center rounded border border-[color:var(--surface-border)] border-dashed bg-muted/20 px-3 text-muted-foreground text-sm">
											No attributes detected.
										</div>
									)}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</section>
	);
}
