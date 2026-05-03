import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { type ReactNode, useMemo } from "react";
import { cn } from "@/web/utils/cn";

export type ClickhouseRow = Record<string, unknown>;

type DynamicResultsTableProps = {
	rows: ClickhouseRow[];
	columns: Array<{ key: string; label: string }>;
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

function getColumnWidthClass(columnKey: string) {
	const normalizedKey = columnKey.toLowerCase();

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
	statistics,
	emptyState,
	className,
}: DynamicResultsTableProps) {
	const data = rows;
	const tableColumns = useMemo<ColumnDef<ClickhouseRow>[]>(
		() =>
			columns.map((column) => ({
				accessorKey: column.key,
				header: column.label,
				cell: ({ getValue }) => (
					<div className="truncate font-mono text-[13px] text-foreground">
						{renderCellValue(getValue(), column.key)}
					</div>
				),
			})),
		[columns],
	);

	const table = useReactTable({
		data,
		columns: tableColumns,
		getCoreRowModel: getCoreRowModel(),
	});

	const headerGroups = table.getHeaderGroups();
	const rowModel = table.getRowModel().rows;
	const columnCount = columns.length;

	return (
		<section
			className={cn(
				"flex min-h-0 flex-col bg-[color:var(--surface-background)]",
				className,
			)}
		>
			<div className="flex items-center gap-2 border-[color:var(--surface-border)] border-b px-4 py-3 sm:px-6">
				<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
					Results table
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
				<div className="min-h-0 flex-1 overflow-auto bg-[color:var(--surface-background)]">
					<table className="min-w-full border-separate border-spacing-0 text-left">
						<thead className="sticky top-0 z-10 bg-[color:var(--surface-background)]/95 backdrop-blur-sm">
							{headerGroups.map((headerGroup) => (
								<tr key={headerGroup.id}>
									{headerGroup.headers.map((header) => (
										<th
											key={header.id}
											className={cn(
												"border-[color:var(--surface-border)] border-b px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]",
												getColumnWidthClass(header.column.id),
											)}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</th>
									))}
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
												"border-[color:var(--surface-border)] border-b px-4 py-2 align-top text-sm",
												getColumnWidthClass(cell.column.id),
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
