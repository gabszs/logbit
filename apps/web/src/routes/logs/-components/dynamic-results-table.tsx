import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Download, WrapText } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Button } from "@/web/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { cn } from "@/web/utils/cn";

export type ClickhouseRow = Record<string, unknown>;

const TABLE_CELL_VERTICAL_PADDING = "py-2";

type DynamicResultsTableProps = {
	rows: ClickhouseRow[];
	columns: Array<{ key: string; label: string }>;
	title?: string;
	enableWrapToggle?: boolean;
	enableCsvDownload?: boolean;
	csvFileName?: string | (() => string);
	csvExportRows?: ClickhouseRow[];
	defaultWrapped?: boolean;
	fitToContainer?: boolean;
	statistics?: {
		elapsed: number;
		rows_read: number;
		bytes_read: number;
	};
	emptyState?: ReactNode;
	className?: string;
};

function isTimestampColumn(columnKey: string) {
	const normalizedKey = columnKey.toLowerCase();
	return normalizedKey.includes("timestamp") || normalizedKey.includes("time");
}

function isSeverityColumn(columnKey: string) {
	const normalizedKey = columnKey.toLowerCase();
	return normalizedKey === "level" || normalizedKey.includes("severity");
}

function isLongTextColumn(columnKey: string) {
	const normalizedKey = columnKey.toLowerCase();
	return (
		normalizedKey === "body" ||
		normalizedKey === "pattern" ||
		normalizedKey === "message" ||
		normalizedKey === "msg" ||
		normalizedKey.includes("body") ||
		normalizedKey.includes("message")
	);
}

function formatTimestampValue(value: string) {
	const match = value.match(
		/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/u,
	);
	if (!match) return value;

	const [, year, month, day, hour, minute, second, fraction = "000"] = match;
	const hourNumber = Number(hour);
	const displayHour = hourNumber % 12 || 12;
	const meridiem = hourNumber >= 12 ? "PM" : "AM";
	const milliseconds = fraction.padEnd(3, "0").slice(0, 3);

	return `${year}-${month}-${Number(day)} ${displayHour}:${minute}:${second}.${milliseconds} ${meridiem}`;
}

function renderCellValue(value: unknown, columnKey: string) {
	if (value == null) return "—";
	if (typeof value === "string") {
		return isTimestampColumn(columnKey) ? formatTimestampValue(value) : value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (value instanceof Date) {
		return isTimestampColumn(columnKey)
			? formatTimestampValue(value.toISOString())
			: value.toISOString();
	}
	if (Array.isArray(value)) return JSON.stringify(value);
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function serializeCsvValue(value: unknown, columnKey: string) {
	const normalizedValue = renderCellValue(value, columnKey).replaceAll('"', '""');
	return `"${normalizedValue}"`;
}

function buildCsvContent(
	rows: ClickhouseRow[],
	columns: Array<{ key: string; label: string }>,
) {
	const header = columns.map((column) =>
		`"${column.label.replaceAll('"', '""')}"`,
	);
	const body = rows.map((row) =>
		columns
			.map((column) => serializeCsvValue(row[column.key], column.key))
			.join(","),
	);
	return [header.join(","), ...body].join("\n");
}

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
			return null;
	}
}

function SeverityBadge({ value }: { value: unknown }) {
	const label = typeof value === "string" ? value.trim().toUpperCase() : "";
	const className = getSeverityBadgeClass(label);

	if (!label || !className) {
		return (
			<div className="truncate font-mono text-[13px] text-foreground">
				{renderCellValue(value, "level")}
			</div>
		);
	}

	return (
		<span
			className={cn(
				"inline-flex h-5 max-w-full items-center rounded border px-1.5 font-mono text-[11px] tabular-nums leading-none",
				className,
			)}
		>
			{label}
		</span>
	);
}

function getColumnWidthClass(
	columnKey: string,
	options?: {
		fitToContainer?: boolean;
	},
) {
	const normalizedKey = columnKey.toLowerCase();
	const fitToContainer = options?.fitToContainer ?? false;

	if (fitToContainer) {
		if (normalizedKey.includes("timestamp") || normalizedKey.includes("time")) {
			return "w-[12.5rem]";
		}

		if (normalizedKey === "service" || normalizedKey.includes("servicename")) {
			return "w-[10rem]";
		}

		if (
			normalizedKey === "level" ||
			normalizedKey.includes("severity") ||
			normalizedKey.includes("status")
		) {
			return "w-[6rem]";
		}

		if (normalizedKey === "body" || normalizedKey.includes("message")) {
			return "w-auto";
		}

		return "w-[9rem]";
	}

	if (normalizedKey.includes("timestamp") || normalizedKey.includes("time")) {
		return "w-[15rem] min-w-[15rem] max-w-[15rem]";
	}

	if (normalizedKey === "service" || normalizedKey.includes("servicename")) {
		return "w-[14rem] min-w-[14rem] max-w-[14rem]";
	}

	if (
		normalizedKey === "level" ||
		normalizedKey.includes("severity") ||
		normalizedKey.includes("status")
	) {
		return "w-[8rem] min-w-[8rem] max-w-[8rem]";
	}

	if (normalizedKey === "body" || normalizedKey.includes("message")) {
		return "w-[44rem] min-w-[28rem]";
	}

	return "w-[14rem] min-w-[12rem]";
}

function formatElapsedMs(elapsedSeconds: number) {
	const elapsedMs = elapsedSeconds * 1000;
	return `${elapsedMs >= 10 ? elapsedMs.toFixed(0) : elapsedMs.toFixed(3)} ms`;
}

function formatKilobytes(bytes: number) {
	return `${(bytes / 1024).toLocaleString(undefined, {
		maximumFractionDigits: 1,
		minimumFractionDigits: bytes < 1024 ? 2 : 0,
	})} KB`;
}

export function DynamicResultsTable({
	rows,
	columns,
	title = "Results table",
	enableWrapToggle = false,
	enableCsvDownload = false,
	csvFileName,
	csvExportRows,
	defaultWrapped = false,
	fitToContainer = false,
	statistics,
	emptyState,
	className,
}: DynamicResultsTableProps) {
	const data = rows;
	const [isWrapped, setIsWrapped] = useState(defaultWrapped);
	const tableColumns = useMemo<ColumnDef<ClickhouseRow>[]>(
		() =>
			columns.map((column) => ({
				accessorKey: column.key,
				header: column.label,
				cell: ({ getValue }) =>
					isSeverityColumn(column.key) ? (
						<SeverityBadge value={getValue()} />
					) : (
						<div
							className={cn(
								"font-mono text-[13px] text-foreground",
								isLongTextColumn(column.key)
									? isWrapped
										? "whitespace-pre-wrap break-words"
										: "truncate whitespace-nowrap"
									: "truncate",
							)}
						>
							{renderCellValue(getValue(), column.key)}
						</div>
					),
			})),
		[columns, isWrapped],
	);

	const table = useReactTable({
		data,
		columns: tableColumns,
		getCoreRowModel: getCoreRowModel(),
	});

	const headerGroups = table.getHeaderGroups();
	const rowModel = table.getRowModel().rows;
	const columnCount = columns.length;
	const hasHeaderToolbar = enableWrapToggle || enableCsvDownload;
	const effectiveCsvRows = csvExportRows ?? rows;
	const headerVerticalPaddingClass = fitToContainer ? "py-2" : "py-3";
	const headerToolbarButtonClass = fitToContainer
		? "h-6 w-6"
		: "h-7 w-7";
	const headerToolbarContainerClass = fitToContainer
		? "px-0 py-0"
		: "px-1.5 py-0.5";

	const triggerCsvDownload = useCallback(() => {
		const content = buildCsvContent(effectiveCsvRows, columns);
		const timestamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
		const baseName =
			typeof csvFileName === "function"
				? csvFileName()
				: csvFileName ?? `logs-export-${timestamp}`;
		const fileName = baseName.endsWith(".csv") ? baseName : `${baseName}.csv`;
		const blob = new Blob([`\uFEFF${content}`], {
			type: "text/csv;charset=utf-8;",
		});
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = fileName;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	}, [columns, csvFileName, effectiveCsvRows]);

	return (
		<section
			className={cn(
				"flex min-h-0 flex-col bg-[color:var(--surface-background)]",
				className,
			)}
		>
			<div className="flex items-center gap-2 border-[color:var(--surface-border)] border-b px-4 py-3 sm:px-6">
				<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
					{title}
				</h2>
				<div className="h-px flex-1 bg-[color:var(--surface-border)]" />
				{statistics ? (
					<>
						<div className="font-mono text-muted-foreground text-xs tabular-nums">
							{formatElapsedMs(statistics.elapsed)}
						</div>
						<div className="h-3 w-px bg-[color:var(--surface-border)]" />
						<div className="font-mono text-muted-foreground text-xs tabular-nums">
							{statistics.rows_read.toLocaleString()} rows
						</div>
						<div className="h-3 w-px bg-[color:var(--surface-border)]" />
						<div className="font-mono text-muted-foreground text-xs tabular-nums">
							{formatKilobytes(statistics.bytes_read)}
						</div>
					</>
				) : null}
			</div>
			{rowModel.length === 0 ? (
				<div className="min-h-0 flex-1 bg-[color:var(--surface-background)]">
					{emptyState}
				</div>
			) : (
				<div
					className={cn(
						"min-h-0 flex-1 bg-[color:var(--surface-background)]",
						fitToContainer ? "overflow-y-auto overflow-x-hidden" : "overflow-auto",
					)}
				>
					<table
						className={cn(
							"border-separate border-spacing-0 text-left",
							fitToContainer ? "table-fixed w-full" : "min-w-full",
						)}
					>
						<thead className="sticky top-0 z-10 bg-[color:var(--surface-background)]/95 backdrop-blur-sm">
							{headerGroups.map((headerGroup) => (
								<tr key={headerGroup.id}>
									{headerGroup.headers.map((header, headerIndex) => {
										const isLastHeader =
											headerIndex === headerGroup.headers.length - 1;

										return (
										<th
											key={header.id}
											className={cn(
												`border-[color:var(--surface-border)] border-b px-4 ${headerVerticalPaddingClass} font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]`,
												hasHeaderToolbar && isLastHeader
													? fitToContainer
														? "bg-[color:var(--surface-background)]/95"
														: "sticky right-0 z-20 bg-[color:var(--surface-background)]/95 backdrop-blur-sm"
													: "",
												getColumnWidthClass(header.column.id, {
													fitToContainer,
												}),
											)}
										>
											<div className="flex items-center gap-2">
												<div className="min-w-0">
													{header.isPlaceholder
														? null
														: flexRender(
																header.column.columnDef.header,
																header.getContext(),
															)}
												</div>
												{hasHeaderToolbar && isLastHeader ? (
													<div
														className={cn(
															"ml-auto flex items-center gap-1 bg-transparent shadow-none",
															headerToolbarContainerClass,
														)}
													>
														{enableWrapToggle ? (
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		type="button"
																		variant="ghost"
																		size="sm"
																		className={cn(
																			headerToolbarButtonClass,
																			"px-0 text-muted-foreground",
																		)}
																		onClick={() => setIsWrapped((prev) => !prev)}
																		aria-label={isWrapped ? "Disable unwrap" : "Enable unwrap"}
																	>
																		<WrapText className="size-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent sideOffset={6}>
																	{isWrapped ? "Disable unwrap" : "Enable unwrap"}
																</TooltipContent>
															</Tooltip>
														) : null}
														{enableCsvDownload ? (
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		type="button"
																		variant="ghost"
																		size="sm"
																		className={cn(
																			headerToolbarButtonClass,
																			"px-0 text-muted-foreground",
																		)}
																		onClick={triggerCsvDownload}
																		aria-label="Download CSV"
																	>
																		<Download className="size-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent sideOffset={6}>
																	Download CSV
																</TooltipContent>
															</Tooltip>
														) : null}
													</div>
												) : null}
											</div>
										</th>
										);
									})}
								</tr>
							))}
						</thead>
						<tbody>
							{rowModel.map((row) => (
								<tr
									key={row.id}
									className="border-[color:var(--surface-border)] border-b transition-colors hover:bg-muted/30"
								>
									{row.getVisibleCells().map((cell) => (
										<td
											key={cell.id}
											className={cn(
												`border-[color:var(--surface-border)] border-b px-4 ${TABLE_CELL_VERTICAL_PADDING} align-top text-sm`,
												getColumnWidthClass(cell.column.id, {
													fitToContainer,
												}),
											)}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
					{columnCount === 0 && (
						<div className="border-[color:var(--surface-border)] border-t px-4 py-3 text-muted-foreground text-xs">
							The query returned rows, but no columns were detected.
						</div>
					)}
				</div>
			)}
		</section>
	);
}
