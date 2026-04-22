import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ConnectionEntityType } from "@/server/features/connections/schemas";
import type { SupportedIntegrationKind } from "@/server/integrations/factory";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
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
import { parseHonoResponse } from "@/web/lib/hono-rpc";
import { AddConnectionDialog } from "./add-connection-dialog";

const CONNECTION_TYPE_LABELS: Record<SupportedIntegrationKind, string> = {
	resend: "Resend",
	cloudflare: "Cloudflare",
	clickhouse: "ClickHouse",
};

type ConnectionRowProps = {
	connection: ConnectionEntityType;
	onRefresh: () => void;
};

export function ConnectionRow({ connection, onRefresh }: ConnectionRowProps) {
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeletePending, setIsDeletePending] = useState(false);

	const handleDelete = async () => {
		setIsDeletePending(true);
		try {
			const response = await fetch(
				`${import.meta.env.VITE_SERVER_URL}/v1/connections/${connection.id}`,
				{ method: "DELETE", credentials: "include" },
			);
			await parseHonoResponse(response);
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
			<div className="flex w-full items-center justify-between gap-4 p-4">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
					<span className="font-semibold text-base">{connection.name}</span>
					<Badge variant="secondary" className="shrink-0">
						{(CONNECTION_TYPE_LABELS as Record<string, string | undefined>)[connection.type] ?? connection.type}
					</Badge>
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
								onClick={() => setIsEditOpen(true)}
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
								onClick={() => setIsDeleteOpen(true)}
								aria-label="Delete connection"
							>
								<Trash2 className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Delete</TooltipContent>
					</Tooltip>
				</div>
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
							<span className="font-medium">{connection.name}</span>. This action
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
								"Delete connection"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
