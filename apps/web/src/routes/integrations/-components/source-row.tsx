import { Database, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { DetailCard } from "@/web/components/ui/detail-card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/web/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import {
	type ConnectionOption,
	deleteSource,
	type SourceEntity,
} from "../-lib/source-api";
import { AddSourceDialog } from "./add-source-dialog";

type SourceRowProps = {
	source: SourceEntity;
	connections: ConnectionOption[];
	onRefresh: () => void;
};

function displayConfigValue(value: number | string | null | undefined) {
	return value == null ? "—" : String(value);
}

function sourceTypeLabel(type: SourceEntity["type"]) {
	return type === "trace" ? "Trace" : "Log";
}

export function SourceRow({ source, connections, onRefresh }: SourceRowProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeletePending, setIsDeletePending] = useState(false);

	const connection = connections.find(
		(item) => item.id === source.connectionId,
	);

	const handleDelete = async () => {
		setIsDeletePending(true);
		try {
			await deleteSource(source.id);
			toast.success("Source deleted successfully");
			onRefresh();
			setIsDeleteOpen(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to delete source";
			toast.error(message);
		} finally {
			setIsDeletePending(false);
		}
	};

	return (
		<>
			<div className="w-full">
				<button
					type="button"
					onClick={() => setIsExpanded((v) => !v)}
					className="flex w-full items-center justify-between gap-4 p-4 text-left"
				>
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<Database className="size-5 shrink-0 text-foreground" />
						<span className="font-semibold text-base">{source.name}</span>
						<Badge variant="secondary" className="shrink-0">
							{sourceTypeLabel(source.type)}
						</Badge>
						{connection && (
							<Badge variant="outline" className="shrink-0">
								{connection.name}
							</Badge>
						)}
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={(e) => {
										e.stopPropagation();
										setIsEditOpen(true);
									}}
									aria-label="Edit source"
								>
									<Pencil className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Edit</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={(e) => {
										e.stopPropagation();
										setIsDeleteOpen(true);
									}}
									aria-label="Delete source"
								>
									<Trash2 className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Delete</TooltipContent>
						</Tooltip>
					</div>
				</button>

				{isExpanded && (
					<div className="app-surface-divider px-4 py-4">
						<div className="grid gap-3 sm:grid-cols-2">
							<DetailCard
								label="Source ID"
								value={source.id}
								className="font-mono sm:col-span-2"
							/>
							<DetailCard
								label="Connection ID"
								value={source.connectionId}
								className="font-mono sm:col-span-2"
							/>
							{connection && (
								<DetailCard label="Connection" value={connection.name} />
							)}
							<DetailCard label="Type" value={sourceTypeLabel(source.type)} />
							<DetailCard
								label="Database"
								value={displayConfigValue(source.config.database)}
								className="font-mono"
							/>
							<DetailCard
								label="Table"
								value={displayConfigValue(source.config.table)}
								className="font-mono"
							/>
							<DetailCard
								label="Default select query"
								value={displayConfigValue(source.config.defaultSelectQuery)}
								className="sm:col-span-2"
								preformatted
							/>
							<DetailCard
								label="Default order by query"
								value={displayConfigValue(source.config.defaultOrderByQuery)}
								className="font-mono sm:col-span-2"
							/>
							<DetailCard
								label="Timestamp query expression"
								value={displayConfigValue(source.config.timestampQueryField)}
								className="font-mono"
							/>
							<DetailCard
								label="Displayed timestamp expression"
								value={displayConfigValue(
									source.config.displayedTimestampField,
								)}
								className="font-mono"
							/>
							<DetailCard
								label="Service name field"
								value={displayConfigValue(source.config.serviceNameField)}
								className="font-mono"
							/>
							<DetailCard
								label="Body field"
								value={displayConfigValue(source.config.bodyField)}
								className="font-mono"
							/>
							<DetailCard
								label="Trace ID field"
								value={displayConfigValue(source.config.traceIdField)}
								className="font-mono"
							/>
							<DetailCard
								label="Span ID field"
								value={displayConfigValue(source.config.spanIdField)}
								className="font-mono"
							/>
							<DetailCard
								label="Resource attributes field"
								value={displayConfigValue(
									source.config.resourceAttributesField,
								)}
								className="font-mono"
							/>
							<DetailCard
								label="Lucene implicit column field"
								value={displayConfigValue(
									source.config.luceneImplicitColumnField,
								)}
								className="font-mono"
							/>
							{source.type === "log" ? (
								<>
									<DetailCard
										label="Severity field"
										value={displayConfigValue(source.config.severityField)}
										className="font-mono"
									/>
									<DetailCard
										label="Log attributes field"
										value={displayConfigValue(source.config.logAttributesField)}
										className="font-mono"
									/>
									<DetailCard
										label="Trace source ID"
										value={source.config.traceSourceId ?? "—"}
										className="font-mono"
									/>
									<DetailCard
										label="Metric source ID"
										value={source.config.metricSourceId ?? "—"}
										className="font-mono"
									/>
								</>
							) : (
								<>
									<DetailCard
										label="Sample rate field"
										value={displayConfigValue(source.config.sampleRateField)}
										className="font-mono"
									/>
									<DetailCard
										label="Span attributes field"
										value={displayConfigValue(
											source.config.spanAttributesField,
										)}
										className="font-mono"
									/>
									<DetailCard
										label="Duration field"
										value={displayConfigValue(source.config.durationField)}
										className="font-mono"
									/>
									<DetailCard
										label="Duration precision field"
										value={displayConfigValue(
											source.config.durationPrecisionField,
										)}
										className="font-mono"
									/>
									<DetailCard
										label="Parent span ID field"
										value={displayConfigValue(source.config.parentSpanIdField)}
										className="font-mono"
									/>
									<DetailCard
										label="Span events field"
										value={displayConfigValue(source.config.spanEventsField)}
										className="font-mono"
									/>
									<DetailCard
										label="Span kind field"
										value={displayConfigValue(source.config.spanKindField)}
										className="font-mono"
									/>
									<DetailCard
										label="Span name field"
										value={displayConfigValue(source.config.spanNameField)}
										className="font-mono"
									/>
									<DetailCard
										label="Status code field"
										value={displayConfigValue(source.config.statusCodeField)}
										className="font-mono"
									/>
									<DetailCard
										label="Status message field"
										value={displayConfigValue(source.config.statusMessageField)}
										className="font-mono"
									/>
									<DetailCard
										label="Log source ID"
										value={source.config.logSourceId ?? "—"}
										className="font-mono"
									/>
									<DetailCard
										label="Metric source ID"
										value={source.config.metricSourceId ?? "—"}
										className="font-mono"
									/>
								</>
							)}
						</div>
					</div>
				)}
			</div>

			<AddSourceDialog
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
				onSuccess={onRefresh}
				mode="edit"
				source={source}
				connections={connections}
			/>

			<Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete source</DialogTitle>
						<DialogDescription>
							This will permanently delete{" "}
							<span className="font-medium">{source.name}</span>. This action
							cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsDeleteOpen(false)}
							disabled={isDeletePending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeletePending}
						>
							{isDeletePending ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete source"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
