import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDown,
	Loader2,
	Pencil,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
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
			<div className="rounded-xl border border-border/70 bg-card/70">
				<div className="flex flex-col gap-4 p-4">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
						<div className="min-w-0 flex-1 space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="font-semibold text-base">{organization.name}</h3>
								{isActive ? <Badge>Active</Badge> : null}
								<Badge
									variant={organization.isMember ? "secondary" : "outline"}
								>
									{organization.isMember ? "Member" : "Not a member"}
								</Badge>
							</div>
							<div className="space-y-1">
								<p className="font-mono text-muted-foreground text-xs">
									/{organization.slug}
								</p>
								<p className="text-muted-foreground text-sm">
									{organization.logo ? "Custom logo configured" : "No logo set"}
								</p>
							</div>
						</div>

						<div className="flex shrink-0 flex-col items-end justify-between gap-3 sm:min-w-52">
							<div className="flex flex-wrap justify-end gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={handleSetActive}
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
									onClick={() => setIsEditOpen(true)}
								>
									<Pencil className="size-4" />
									Edit
								</Button>

								<Button
									type="button"
									size="sm"
									variant="destructive"
									onClick={() => setIsDeleteOpen(true)}
								>
									<Trash2 className="size-4" />
									Delete
								</Button>
							</div>

							<Button
								type="button"
								size="icon"
								variant="ghost"
								onClick={() => setIsExpanded((current) => !current)}
								aria-label={isExpanded ? "Hide details" : "Show details"}
								className="shadow-none hover:shadow-sm"
							>
								<ChevronDown
									className={cn(
										"size-4 transition-transform",
										isExpanded && "rotate-180",
									)}
								/>
							</Button>
						</div>
					</div>
				</div>

				{isExpanded ? (
					<div className="border-border/70 border-t px-4 py-4">
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
									<div>
										<p className="text-muted-foreground text-xs uppercase tracking-wide">
											Organization ID
										</p>
										<p className="font-mono text-sm">{detailsQuery.data.id}</p>
									</div>
									<div>
										<p className="text-muted-foreground text-xs uppercase tracking-wide">
											Name
										</p>
										<p className="text-sm">{detailsQuery.data.name}</p>
									</div>
									<div>
										<p className="text-muted-foreground text-xs uppercase tracking-wide">
											Slug
										</p>
										<p className="font-mono text-sm">
											{detailsQuery.data.slug}
										</p>
									</div>
									<div>
										<p className="text-muted-foreground text-xs uppercase tracking-wide">
											Members
										</p>
										<p className="text-sm">
											{detailsQuery.data.members?.length ?? 0} member
											{detailsQuery.data.members?.length === 1 ? "" : "s"}
										</p>
									</div>
								</div>

								<div className="space-y-3">
									<div>
										<p className="text-muted-foreground text-xs uppercase tracking-wide">
											Logo
										</p>
										<p className="break-all text-sm">
											{detailsQuery.data.logo || "No logo configured"}
										</p>
									</div>
									<div>
										<p className="text-muted-foreground text-xs uppercase tracking-wide">
											Metadata
										</p>
										<pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">
											{formatMetadata(detailsQuery.data.metadata)}
										</pre>
									</div>
								</div>
							</div>
						) : null}
					</div>
				) : null}
			</div>

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
