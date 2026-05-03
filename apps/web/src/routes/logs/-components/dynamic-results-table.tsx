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
	emptyState?: ReactNode;
	className?: string;
};

function renderCellValue(value: unknown) {
	if (value == null) return "—";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return JSON.stringify(value);
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export function DynamicResultsTable({
	rows,
	columns,
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
					<div className="max-w-[28rem] truncate font-mono text-[13px] text-foreground">
						{renderCellValue(getValue())}
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
				<div className="font-mono text-muted-foreground text-xs tabular-nums">
					{rows.length.toLocaleString()} rows
				</div>
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
											className="border-[color:var(--surface-border)] border-b px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]"
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
											className="max-w-0 border-[color:var(--surface-border)] border-b px-4 py-2 align-top text-sm"
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
