import { Braces, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/web/components/ui/button";
import { CopyButton } from "@/web/components/ui/copy-button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { copyToClipboard } from "@/web/utils/clipboard";
import { cn } from "@/web/utils/cn";
import type { DataRow } from "./types";
import {
	formatPrimitiveValue,
	getValueEntries,
	safeStringify,
	tryParseJsonString,
} from "./value-formatting";

function getSummary(value: unknown) {
	const inspectable = tryParseJsonString(value);
	if (Array.isArray(inspectable)) {
		return `[${inspectable.length}]`;
	}
	if (
		typeof inspectable === "object" &&
		inspectable !== null &&
		!Array.isArray(inspectable)
	) {
		return `{${Object.keys(inspectable).length}}`;
	}
	return formatPrimitiveValue(inspectable);
}

function getValueColorClass(value: unknown) {
	const inspectable = tryParseJsonString(value);
	if (typeof inspectable === "string") {
		return "text-emerald-700 dark:text-emerald-300";
	}
	if (typeof inspectable === "number") {
		return "text-sky-700 dark:text-sky-300";
	}
	if (typeof inspectable === "boolean") {
		return "text-amber-700 dark:text-amber-300";
	}
	if (inspectable == null) {
		return "text-stone-500 dark:text-stone-400";
	}
	return "text-foreground";
}

function valueMatchesSearch(
	path: string,
	keyName: string,
	value: unknown,
	search: string,
) {
	if (!search) return true;
	const haystack = `${path} ${keyName} ${getSummary(value)}`.toLowerCase();
	return haystack.includes(search);
}

function hasMatchingDescendant(
	value: unknown,
	path: string,
	search: string,
): boolean {
	if (!search) return true;
	return getValueEntries(value).some(([keyName, nestedValue]) => {
		const nextPath = path ? `${path}.${keyName}` : keyName;
		return (
			valueMatchesSearch(nextPath, keyName, nestedValue, search) ||
			hasMatchingDescendant(nestedValue, nextPath, search)
		);
	});
}

function CopyAction({ label, value }: { label: string; value: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex">
					<CopyButton
						aria-label={label}
						onMouseDown={(event) => {
							event.stopPropagation();
						}}
						onCopy={async () => {
							await copyToClipboard(value);
						}}
						className="size-7 border border-transparent bg-transparent text-muted-foreground opacity-0 shadow-none transition-all hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-background)] hover:text-foreground group-hover/row:opacity-100"
						iconClassName="size-3.5"
					>
						<span className="sr-only">{label}</span>
					</CopyButton>
				</span>
			</TooltipTrigger>
			<TooltipContent sideOffset={6}>{label}</TooltipContent>
		</Tooltip>
	);
}

function ValueNode({
	keyName,
	value,
	path,
	depth,
	search,
	isWrapped,
	expandedPaths,
	onToggle,
}: {
	keyName: string;
	value: unknown;
	path: string;
	depth: number;
	search: string;
	isWrapped: boolean;
	expandedPaths: Set<string>;
	onToggle: (path: string) => void;
}) {
	const entries = getValueEntries(value);
	const hasChildren = entries.length > 0;
	const isExpanded = expandedPaths.has(path) || Boolean(search && hasChildren);
	const matchesSelf = valueMatchesSearch(path, keyName, value, search);
	const matchesChild = hasMatchingDescendant(value, path, search);

	if (search && !matchesSelf && !matchesChild) {
		return null;
	}

	const summary = getSummary(value);
	const showSummary = !(hasChildren && isExpanded);
	const objectCopyValue = safeStringify(tryParseJsonString(value));
	const rowCopyValue = `${path}: ${objectCopyValue}`;

	return (
		<div>
			<div className="group/row border-[color:var(--surface-border)] border-b px-1 py-0 last:border-b-0">
				<div
					className="flex min-h-6 items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/35"
					style={{ paddingLeft: `${depth * 12}px` }}
				>
					<div className="flex min-w-0 flex-1 items-center gap-1 font-mono text-[12px] leading-4">
						{hasChildren ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-5 shrink-0 text-muted-foreground"
								onClick={() => onToggle(path)}
								aria-label={isExpanded ? "Collapse value" : "Expand value"}
							>
								{isExpanded ? (
									<ChevronDown className="size-3.5" />
								) : (
									<ChevronRight className="size-3.5" />
								)}
							</Button>
						) : (
							<span className="size-5 shrink-0" />
						)}
						<span className="flex min-w-0 shrink items-center gap-0.5">
							<span className="min-w-0 truncate text-[#f6821f] dark:text-[#f6821f]">
								{keyName}
							</span>
							<span className="shrink-0 text-muted-foreground">:</span>
						</span>
						{showSummary ? (
							<span
								className={cn(
									"min-w-0 flex-1",
									getValueColorClass(value),
									isWrapped
										? "whitespace-pre-wrap break-words"
										: "overflow-hidden text-ellipsis whitespace-nowrap",
								)}
							>
								{summary}
							</span>
						) : null}
					</div>
					<div className="ml-auto flex shrink-0 items-center gap-1">
						<CopyAction
							label={hasChildren ? "Copy object" : "Copy row"}
							value={hasChildren ? objectCopyValue : rowCopyValue}
						/>
					</div>
				</div>
			</div>
			{hasChildren && isExpanded
				? entries.map(([childKey, childValue]) => {
						const childPath = path ? `${path}.${childKey}` : childKey;
						return (
							<ValueNode
								key={childPath}
								keyName={childKey}
								value={childValue}
								path={childPath}
								depth={depth + 1}
								search={search}
								isWrapped={isWrapped}
								expandedPaths={expandedPaths}
								onToggle={onToggle}
							/>
						);
					})
				: null}
		</div>
	);
}

export function StructuredValueTree({
	value,
	search,
	isWrapped,
}: {
	value: DataRow;
	search: string;
	isWrapped: boolean;
}) {
	const normalizedSearch = search.trim().toLowerCase();
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
	const entries = useMemo(() => Object.entries(value), [value]);

	useEffect(() => {
		setExpandedPaths(
			new Set(
				entries
					.filter(([, nestedValue]) => getValueEntries(nestedValue).length > 0)
					.map(([keyName]) => keyName),
			),
		);
	}, [entries]);

	const togglePath = (path: string) => {
		setExpandedPaths((previous) => {
			const next = new Set(previous);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	const visibleEntries = entries.filter(([keyName, nestedValue]) => {
		return (
			valueMatchesSearch(keyName, keyName, nestedValue, normalizedSearch) ||
			hasMatchingDescendant(nestedValue, keyName, normalizedSearch)
		);
	});

	if (visibleEntries.length === 0) {
		return (
			<div className="flex min-h-[10rem] items-center justify-center text-muted-foreground text-sm">
				No attributes match the current search.
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-background)]">
			<div className="flex items-center gap-2 border-[color:var(--surface-border)] border-b bg-muted/30 px-3 py-2 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
				<Braces className="size-3.5" />
				Attributes
			</div>
			<div className="max-h-[48vh] overflow-auto px-0 py-2">
				{visibleEntries.map(([keyName, nestedValue]) => (
					<ValueNode
						key={keyName}
						keyName={keyName}
						value={nestedValue}
						path={keyName}
						depth={0}
						search={normalizedSearch}
						isWrapped={isWrapped}
						expandedPaths={expandedPaths}
						onToggle={togglePath}
					/>
				))}
			</div>
		</div>
	);
}
