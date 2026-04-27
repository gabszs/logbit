import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useMemo, useRef } from "react";

export type ClickhouseRow = Record<string, unknown>;

type DynamicResultsTableProps = {
	rows: ClickhouseRow[];
	columns: Array<{ key: string; label: string }>;
	emptyState?: ReactNode;
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

	const scrollRef = useRef<HTMLDivElement>(null);
	const rowVirtualizer = useVirtualizer({
		count: table.getRowModel().rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 44,
		overscan: 8,
	});

	const virtualRows = rowVirtualizer.getVirtualItems();
	const totalSize = rowVirtualizer.getTotalSize();
	const headerGroups = table.getHeaderGroups();
	const rowModel = table.getRowModel().rows;
	const columnCount = columns.length;

	return (
		<section className="space-y-3">
			<div className="flex items-center gap-2">
				<div className="h-px flex-1 bg-border/70" />
				<h2 className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
					Results table
				</h2>
				<div className="h-px flex-1 bg-border/70" />
			</div>
			{rowModel.length === 0 ? (
				<div className="rounded-2xl border border-border/70 border-dashed bg-muted/20 p-6">
					{emptyState}
				</div>
			) : (
				<div
					ref={scrollRef}
					className="max-h-[38rem] overflow-auto rounded-2xl border border-border/70 bg-card/70"
				>
					<table className="min-w-full border-separate border-spacing-0 text-left">
						<thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
							{headerGroups.map((headerGroup) => (
								<tr key={headerGroup.id}>
									{headerGroup.headers.map((header) => (
										<th
											key={header.id}
											className="border-border/70 border-b px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]"
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
						<tbody style={{ height: `${totalSize}px`, position: "relative" }}>
							{virtualRows.map((virtualRow) => {
								const row = rowModel[virtualRow.index];
								return (
									<tr
										key={row.id}
										data-index={virtualRow.index}
										style={{
											position: "absolute",
											left: 0,
											transform: `translateY(${virtualRow.start}px)`,
											width: "100%",
										}}
										className="border-border/40 border-b transition-colors hover:bg-muted/30"
									>
										{row.getVisibleCells().map((cell) => (
											<td
												key={cell.id}
												className="max-w-0 border-border/40 border-b px-4 py-2 align-top text-sm"
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</td>
										))}
									</tr>
								);
							})}
						</tbody>
					</table>
					{columnCount === 0 && (
						<div className="border-border/70 border-t px-4 py-3 text-muted-foreground text-xs">
							The query returned rows, but no columns were detected.
						</div>
					)}
				</div>
			)}
		</section>
	);
}
