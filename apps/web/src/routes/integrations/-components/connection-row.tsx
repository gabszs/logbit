import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ConnectionEntityType } from "@/server/features/connections/schemas";
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
import { INTEGRATIONS } from "@/web/lib/integrations";
import { deleteConnection } from "../-lib/source-api";
import { AddConnectionDialog } from "./add-connection-dialog";

type ConnectionRowProps = {
	connection: ConnectionEntityType;
	onRefresh: () => void;
};

export function ConnectionRow({ connection, onRefresh }: ConnectionRowProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeletePending, setIsDeletePending] = useState(false);

	const integration = INTEGRATIONS[connection.type];

	const handleDelete = async () => {
		setIsDeletePending(true);
		try {
			await deleteConnection(connection.id);
			toast.success("Connection deleted successfully");
			onRefresh();
			setIsDeleteOpen(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to delete connection";
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
						{integration && (
							<integration.logo className="size-5 shrink-0 text-foreground" />
						)}
						<span className="font-semibold text-base">{connection.name}</span>
						<Badge variant="outline" className="shrink-0">
							{connection.isActive ? "Active" : "Inactive"}
						</Badge>
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
									aria-label="Edit connection"
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
									aria-label="Delete connection"
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
								label="Connection ID"
								value={connection.id}
								className="font-mono sm:col-span-2"
							/>

							{connection.type === "resend" && (
								<DetailCard
									label="API Key"
									value="••••••••"
									copyValue={connection.config.apiKey}
									className="sm:col-span-2"
								/>
							)}

							{connection.type === "cloudflare" && (
								<>
									<DetailCard
										label="API Key"
										value="••••••••"
										copyValue={connection.config.apiKey}
									/>
									<DetailCard
										label="Zone ID"
										value={connection.config.zoneId}
										className="font-mono"
									/>
								</>
							)}

							{connection.type === "clickhouse" && (
								<>
									<DetailCard
										label="Host"
										value={connection.config.host}
										className="font-mono sm:col-span-2"
									/>
									<DetailCard
										label="Username"
										value={connection.config.username}
									/>
									<DetailCard
										label="Database"
										value={connection.config.database ?? "—"}
									/>
									{connection.config.password && (
										<DetailCard
											label="Password"
											value="••••••••"
											copyValue={connection.config.password}
										/>
									)}
								</>
							)}
						</div>
					</div>
				)}
			</div>

			<AddConnectionDialog
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
				mode="edit"
				connection={connection}
				onSuccess={onRefresh}
			/>

			<Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete connection</DialogTitle>
						<DialogDescription>
							This will permanently delete{" "}
							<span className="font-medium">{connection.name}</span>. This
							action cannot be undone.
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
								"Delete connection"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
