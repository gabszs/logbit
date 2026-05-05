import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/web/components/ui/sheet";
import { BodyBlock } from "./body-block";
import { ColumnValuesSection } from "./column-values-section";
import { RowHeader } from "./row-header";
import type { DataRow, RowIdentity, RowPanelAdapter } from "./types";

function StateMessage({
	title,
	description,
	variant = "default",
}: {
	title: string;
	description: string;
	variant?: "default" | "danger";
}) {
	return (
		<div className="flex min-h-[18rem] items-start justify-center px-5 py-6">
			<div
				className={
					variant === "danger"
						? "w-full rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive"
						: "w-full rounded-md border border-[color:var(--surface-border)] bg-muted/30 px-4 py-3 text-muted-foreground"
				}
			>
				<div className="flex items-center gap-2 font-medium text-sm">
					{variant === "danger" ? (
						<AlertTriangle className="size-4 shrink-0" />
					) : null}
					<span>{title}</span>
				</div>
				<p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-6">
					{description}
				</p>
			</div>
		</div>
	);
}

function SuccessPanel({
	row,
	identity,
	adapter,
}: {
	row: DataRow;
	identity: RowIdentity;
	adapter: RowPanelAdapter;
}) {
	const fields = adapter.resolveFields(row);
	const columnValues = adapter.getColumnValues?.(row) ?? row;
	const columnValuesLabel = adapter.getColumnValuesLabel?.(row, fields);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<RowHeader fields={fields} tableLabel={identity.tableLabel} />
			<BodyBlock fields={fields} />
			<div className="min-h-0 flex-1 overflow-auto">
				<ColumnValuesSection row={columnValues} label={columnValuesLabel} />
				{adapter.renderExtraSections?.(row)}
			</div>
		</div>
	);
}

export function DataRowSidePanel({
	open,
	onOpenChange,
	identity,
	adapter,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	identity: RowIdentity | null;
	adapter: RowPanelAdapter | null;
}) {
	const query = useQuery({
		queryKey:
			identity && adapter
				? adapter.getQueryKey(identity)
				: ["data-row-side-panel", "idle"],
		queryFn: async () => {
			if (!identity || !adapter) {
				return { rows: [] };
			}
			return await adapter.fetchRow(identity);
		},
		enabled: open && identity != null && adapter != null,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const rows = query.data?.rows ?? [];
	const errorMessage =
		query.error && adapter?.formatError
			? adapter.formatError(query.error)
			: query.error instanceof Error
				? query.error.message
				: "Failed to load row details";

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-[94vw] max-w-none gap-0 border-[color:var(--surface-border)] bg-[color:var(--surface-background)] p-0 sm:w-[70vw] sm:max-w-none"
			>
				<SheetHeader className="sr-only">
					<SheetTitle>Row details</SheetTitle>
					<SheetDescription>Inspect selected row values.</SheetDescription>
				</SheetHeader>
				{!identity || !adapter ? (
					<StateMessage
						title="No row selected"
						description="Select a table row to inspect details."
					/>
				) : query.isPending || query.isFetching ? (
					<div className="flex min-h-[18rem] items-center justify-center gap-2 text-muted-foreground text-sm">
						<Loader2 className="size-4 animate-spin" />
						Loading row details
					</div>
				) : query.error ? (
					<StateMessage
						title="Could not load row details"
						description={errorMessage}
						variant="danger"
					/>
				) : rows.length === 0 ? (
					<StateMessage
						title="No matching row"
						description="The selected row identity did not match any row in the source table."
					/>
				) : rows.length > 1 ? (
					<StateMessage
						title="Ambiguous row identity"
						description="The selected row identity matched more than one row. Add more identifying fields to the source or query before opening details."
						variant="danger"
					/>
				) : (
					<SuccessPanel row={rows[0]} identity={identity} adapter={adapter} />
				)}
			</SheetContent>
		</Sheet>
	);
}
