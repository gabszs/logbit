import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { CopyButton } from "@/web/components/ui/copy-button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/web/components/ui/dialog";
import { authClient } from "@/web/lib/auth-client";
import { cn } from "@/web/utils/cn";
import { OrganizationFormDialog } from "./organization-form-dialog";
import type {
	OrganizationAuthClient,
	OrganizationListItem,
	OrganizationListRow,
} from "./types";

const organizationAuthClient = authClient as typeof authClient &
	OrganizationAuthClient;

function formatMetadata(value: unknown) {
	if (value == null || value === "") {
		return "No metadata";
	}

	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			return value;
		}
	}

	return JSON.stringify(value, null, 2);
}

function DetailCard({
	label,
	value,
	copyValue,
	className,
	preformatted = false,
}: {
	label: string;
	value: string;
	copyValue?: string;
	className?: string;
	preformatted?: boolean;
}) {
	return (
		<div
			className={cn(
				"group relative rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5",
				className,
			)}
		>
			<p className="pr-8 text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
				{label}
			</p>
			{preformatted ? (
				<pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
					{value}
				</pre>
			) : (
				<p className="mt-1 break-words text-sm leading-5">{value}</p>
			)}
			<CopyButton
				onCopy={async () => {
					await navigator.clipboard.writeText(copyValue ?? value);
					toast.success(`${label} copied`);
				}}
				aria-label={`Copy ${label}`}
				className="absolute top-1/2 right-2 size-7 -translate-y-1/2 opacity-0 shadow-none transition-opacity hover:shadow-sm group-hover:opacity-100"
			/>
		</div>
	);
}

type OrganizationRowProps = {
	activeOrganizationId?: string | null;
	onRefresh: () => Promise<void>;
	organization: OrganizationListRow;
};

export function OrganizationRow({
	activeOrganizationId,
	onRefresh,
	organization,
}: OrganizationRowProps) {
	const queryClient = useQueryClient();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeletePending, setIsDeletePending] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isSetActivePending, setIsSetActivePending] = useState(false);

	const detailsQuery = useQuery({
		queryKey: ["organization", "details", organization.id],
		enabled: isExpanded,
		retry: false,
		queryFn: async () => {
			const { data, error } =
				await organizationAuthClient.organization.getFullOrganization({
					organizationId: organization.id,
					membersLimit: 1,
				});

			if (error) {
				throw new Error(error.message || "Failed to load organization details");
			}

			if (!data) {
				throw new Error("Organization details are unavailable");
			}

			return data;
		},
	});

	const isActive = organization.id === activeOrganizationId;
	const editableOrganization: OrganizationListItem = {
		...organization,
		logo: detailsQuery.data?.logo ?? organization.logo,
		metadata: detailsQuery.data?.metadata ?? organization.metadata,
	};

	const handleSetActive = async () => {
		if (isActive) return;

		setIsSetActivePending(true);

		try {
			const { error } = await organizationAuthClient.organization.setActive({
				organizationId: organization.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to set active organization");
			}

			await queryClient.invalidateQueries();
			toast.success(`Active organization set to ${organization.name}`);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to set active organization";
			toast.error(message);
		} finally {
			setIsSetActivePending(false);
		}
	};

	const handleDelete = async () => {
		setIsDeletePending(true);

		try {
			const { error } = await organizationAuthClient.organization.delete({
				organizationId: organization.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to delete organization");
			}

			await onRefresh();
			await queryClient.invalidateQueries();
			setIsDeleteOpen(false);
			toast.success("Organization deleted successfully");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to delete organization";
			toast.error(message);
		} finally {
			setIsDeletePending(false);
		}
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setIsExpanded((current) => !current)}
				className="flex w-full flex-col gap-4 p-4 text-left"
			>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-semibold text-base">{organization.name}</h3>
							<Badge variant={organization.isMember ? "secondary" : "outline"}>
								{organization.isMember ? "Member" : "Not a member"}
							</Badge>
						</div>
					</div>

					<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={(event: MouseEvent<HTMLButtonElement>) => {
								event.stopPropagation();
								void handleSetActive();
							}}
							disabled={isActive || isSetActivePending}
						>
							{isSetActivePending ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Switching...
								</>
							) : (
								<>
									<ShieldCheck className="size-4" />
									Set active
								</>
							)}
						</Button>

						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={(event: MouseEvent<HTMLButtonElement>) => {
								event.stopPropagation();
								setIsEditOpen(true);
							}}
						>
							<Pencil className="size-4" />
							Edit
						</Button>

						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={(event: MouseEvent<HTMLButtonElement>) => {
								event.stopPropagation();
								setIsDeleteOpen(true);
							}}
						>
							<Trash2 className="size-4" />
							Delete
						</Button>
					</div>
				</div>

				{isExpanded ? (
					<div className="space-y-3">
						{detailsQuery.isPending ? (
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<Loader2 className="size-4 animate-spin" />
								Loading organization details...
							</div>
						) : detailsQuery.error ? (
							<Alert variant="destructive">
								<AlertTitle>Failed to load organization details</AlertTitle>
								<AlertDescription>
									{detailsQuery.error.message}
								</AlertDescription>
							</Alert>
						) : detailsQuery.data ? (
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-3">
									<DetailCard
										label="Organization ID"
										value={detailsQuery.data.id}
										className="font-mono"
									/>
									<DetailCard label="Name" value={detailsQuery.data.name} />
									<DetailCard
										label="Slug"
										value={`/${detailsQuery.data.slug}`}
										className="font-mono"
									/>
								</div>

								<div className="space-y-3">
									<DetailCard
										label="Members"
										value={`${detailsQuery.data.members?.length ?? 0} member${
											detailsQuery.data.members?.length === 1 ? "" : "s"
										}`}
									/>
									<DetailCard
										label="Logo"
										value={detailsQuery.data.logo || "No logo configured"}
									/>
									<DetailCard
										label="Metadata"
										value={formatMetadata(detailsQuery.data.metadata)}
										preformatted
									/>
								</div>
							</div>
						) : null}
					</div>
				) : null}
			</button>

			<OrganizationFormDialog
				mode="edit"
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
				onSuccess={async () => {
					await onRefresh();
					await queryClient.invalidateQueries({
						queryKey: ["organization", "details", organization.id],
					});
				}}
				organization={editableOrganization}
			/>

			<Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete organization</DialogTitle>
						<DialogDescription>
							This will permanently delete {organization.name}. This action
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
								"Delete organization"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
