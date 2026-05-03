import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDown,
	Loader2,
	LogOut,
	Pencil,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { authClient } from "@/web/lib/auth-client";
import { cn } from "@/web/utils/cn";
import { DetailCard } from "../detail-card";
import { OrganizationFormDialog } from "./organization-form-dialog";
import type {
	OrganizationDetail,
	OrganizationListItem,
	OrganizationListRow,
	OrganizationMemberSummary,
} from "./types";

const MANAGEABLE_ROLES = new Set(["owner", "admin"]);
const MEMBER_ROLE_OPTIONS = ["member", "admin", "owner"] as const;

function getMemberKey(
	member: OrganizationMemberSummary,
	fallback?: string | null,
) {
	return (
		member.id ??
		member.userId ??
		member.user?.id ??
		member.user?.email ??
		fallback ??
		null
	);
}

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

function MemberRow({
	member,
	role,
	canManageMembers,
	isUpdatingRole,
	isRemovingMember,
	onRoleChange,
	onRequestRemove,
}: {
	member: OrganizationMemberSummary;
	role: string;
	canManageMembers: boolean;
	isUpdatingRole: boolean;
	isRemovingMember: boolean;
	onRoleChange: (member: OrganizationMemberSummary, nextRole: string) => void;
	onRequestRemove: (member: OrganizationMemberSummary) => void;
}) {
	const email = member.user?.email?.trim() || "No email";

	return (
		<div className="app-surface grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
			<div className="min-w-0">
				<p className="truncate text-sm">{email}</p>
			</div>
			{canManageMembers ? (
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Select
						value={role}
						onValueChange={(nextRole) => onRoleChange(member, nextRole)}
						disabled={isUpdatingRole || isRemovingMember}
					>
						<SelectTrigger size="sm" className="min-w-32">
							<SelectValue placeholder="Select role" />
						</SelectTrigger>
						<SelectContent>
							{MEMBER_ROLE_OPTIONS.map((option) => (
								<SelectItem key={option} value={option}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={(event: MouseEvent<HTMLButtonElement>) => {
									event.stopPropagation();
									onRequestRemove(member);
								}}
								disabled={isUpdatingRole || isRemovingMember}
								aria-label="Remove member"
							>
								{isRemovingMember ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<X className="size-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Remove</TooltipContent>
					</Tooltip>
				</div>
			) : (
				<div className="text-muted-foreground text-sm">{role}</div>
			)}
		</div>
	);
}

type OrganizationRowProps = {
	activeOrganizationId?: string | null;
	currentUserId?: string | null;
	onRefresh: () => Promise<void>;
	organization: OrganizationListRow;
};

type MembershipState = "member" | "not-member" | "checking" | "unavailable";

function getDisplayedRole({
	details,
	currentUserId,
	fallbackRole,
}: {
	details?: OrganizationDetail;
	currentUserId?: string | null;
	fallbackRole?: string | null;
}) {
	const currentMember = details?.members?.find((member) => {
		return member.userId === currentUserId || member.user?.id === currentUserId;
	});

	return currentMember?.role || fallbackRole || null;
}

function isCurrentUserMember(
	members: OrganizationMemberSummary[] | null | undefined,
	currentUserId: string | null | undefined,
) {
	if (!currentUserId || !members?.length) return false;

	return members.some((member) => {
		return member.userId === currentUserId || member.user?.id === currentUserId;
	});
}

function getMembershipState({
	currentUserId,
	detailsError,
	detailsPending,
	details,
	hasExplicitMembership,
	isActive,
}: {
	currentUserId?: string | null;
	detailsError: boolean;
	detailsPending: boolean;
	details?: OrganizationDetail;
	hasExplicitMembership: boolean;
	isActive: boolean;
}): MembershipState {
	if (!currentUserId) return "unavailable";

	if (details?.members) {
		return isCurrentUserMember(details.members, currentUserId)
			? "member"
			: "not-member";
	}

	if (hasExplicitMembership || isActive) {
		return "member";
	}

	if (detailsPending) {
		return "checking";
	}

	if (detailsError) {
		return "unavailable";
	}

	return "checking";
}

export function OrganizationRow({
	activeOrganizationId,
	currentUserId,
	onRefresh,
	organization,
}: OrganizationRowProps) {
	const queryClient = useQueryClient();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeletePending, setIsDeletePending] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isMembersExpanded, setIsMembersExpanded] = useState(false);
	const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
	const [memberPendingRemoval, setMemberPendingRemoval] =
		useState<OrganizationMemberSummary | null>(null);
	const [memberActionKey, setMemberActionKey] = useState<string | null>(null);
	const [memberActionType, setMemberActionType] = useState<
		"role-update" | "remove" | null
	>(null);
	const [memberRoleOverrides, setMemberRoleOverrides] = useState<
		Record<string, string>
	>({});
	const [isLeavePending, setIsLeavePending] = useState(false);
	const isActive = organization.id === activeOrganizationId;

	const detailsQuery = useQuery<OrganizationDetail>({
		queryKey: ["organization", "details", organization.id],
		enabled: Boolean(currentUserId),
		retry: false,
		queryFn: async () => {
			const { data, error } = await authClient.organization.getFullOrganization(
				{
					query: {
						organizationId: organization.id,
						membersLimit: 100,
					},
				},
			);

			if (error) {
				throw new Error(error.message || "Failed to load organization details");
			}

			if (!data) {
				throw new Error("Organization details are unavailable");
			}

			return data;
		},
	});
	const currentMemberFromDetails = detailsQuery.data?.members?.find(
		(member) => {
			return (
				member.userId === currentUserId || member.user?.id === currentUserId
			);
		},
	);
	const activeMemberRoleQuery = useQuery({
		queryKey: ["organization", "active-member-role", organization.id],
		enabled:
			Boolean(currentUserId) &&
			isActive &&
			!currentMemberFromDetails?.role &&
			isExpanded,
		retry: false,
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.getActiveMemberRole();

			if (error) {
				throw new Error(error.message || "Failed to load active member role");
			}

			return data?.role ?? null;
		},
	});
	const membershipState = getMembershipState({
		currentUserId,
		detailsError: detailsQuery.isError,
		detailsPending: detailsQuery.isPending,
		details: detailsQuery.data,
		hasExplicitMembership: organization.hasExplicitMembership,
		isActive,
	});
	const isMember = membershipState === "member";
	const displayedRole = getDisplayedRole({
		details: detailsQuery.data,
		currentUserId,
		fallbackRole:
			currentMemberFromDetails?.role ??
			activeMemberRoleQuery.data ??
			organization.role,
	});
	const editableOrganization: OrganizationListItem = {
		...organization,
		logo: detailsQuery.data?.logo ?? organization.logo,
		metadata: detailsQuery.data?.metadata ?? organization.metadata,
	};
	const members = detailsQuery.data?.members ?? [];
	const membersCount = members.length;
	const canManageMembers = MANAGEABLE_ROLES.has(String(displayedRole ?? ""));

	useEffect(() => {
		if (!isExpanded) {
			setIsMembersExpanded(false);
		}
	}, [isExpanded]);

	const handleUpdateMemberRole = async (
		member: OrganizationMemberSummary,
		nextRole: string,
	) => {
		if (!member.id || !organization.id || member.role === nextRole) return;

		const memberKey = getMemberKey(member);
		setMemberActionKey(memberKey);
		setMemberActionType("role-update");

		try {
			const { error } = await authClient.organization.updateMemberRole({
				memberId: member.id,
				role: nextRole,
				organizationId: organization.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to update member role");
			}

			setMemberRoleOverrides((current) => ({
				...current,
				[getMemberKey(member, "") ?? ""]: nextRole,
			}));
			await queryClient.invalidateQueries({
				queryKey: ["organization", "details", organization.id],
			});
			await queryClient.invalidateQueries({
				queryKey: ["better-auth", "organizations", "list"],
			});
			toast.success("Member role updated");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update member role";
			toast.error(message);
		} finally {
			setMemberActionKey(null);
			setMemberActionType(null);
		}
	};

	const handleRemoveMember = async (member: OrganizationMemberSummary) => {
		const memberIdOrEmail = member.id || member.user?.email;
		if (!memberIdOrEmail || !organization.id) return;

		const memberKey = getMemberKey(member);
		setMemberActionKey(memberKey);
		setMemberActionType("remove");

		try {
			const { error } = await authClient.organization.removeMember({
				memberIdOrEmail,
				organizationId: organization.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to remove member");
			}

			setMemberRoleOverrides((current) => {
				const next = { ...current };
				delete next[getMemberKey(member, "") ?? ""];
				return next;
			});
			await queryClient.invalidateQueries({
				queryKey: ["organization", "details", organization.id],
			});
			await queryClient.invalidateQueries({
				queryKey: ["better-auth", "organizations", "list"],
			});
			toast.success("Member removed");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to remove member";
			toast.error(message);
		} finally {
			setMemberActionKey(null);
			setMemberActionType(null);
			setMemberPendingRemoval(null);
		}
	};

	const handleLeave = async () => {
		setIsLeavePending(true);

		try {
			const { error } = await authClient.organization.leave({
				organizationId: organization.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to leave organization");
			}

			await onRefresh();
			await queryClient.invalidateQueries();
			toast.success(`You left ${organization.name}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to leave organization";
			toast.error(message);
		} finally {
			setIsLeavePending(false);
			setIsLeaveConfirmOpen(false);
		}
	};

	const handleDelete = async () => {
		setIsDeletePending(true);

		try {
			const { error } = await authClient.organization.delete({
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
			<div className="flex flex-col gap-4 p-4">
				<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onClick={() => setIsExpanded((current) => !current)}
						className="min-w-0 flex-1 text-left"
					>
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-semibold text-base">{organization.name}</h3>
							{isMember && displayedRole ? (
								<Badge variant="secondary">{displayedRole}</Badge>
							) : null}
						</div>
					</button>

					<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
						{activeMemberRoleQuery.isFetching ? (
							<Button type="button" size="sm" variant="ghost" disabled>
								<RotateCcw className="size-4 animate-spin" />
							</Button>
						) : null}

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={(event: MouseEvent<HTMLButtonElement>) => {
										event.stopPropagation();
										setIsEditOpen(true);
									}}
									aria-label="Edit organization"
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
									onClick={(event: MouseEvent<HTMLButtonElement>) => {
										event.stopPropagation();
										setIsLeaveConfirmOpen(true);
									}}
									disabled={!isMember || isLeavePending}
									aria-label="Leave organization"
								>
									{isLeavePending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<LogOut className="size-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>Leave</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={(event: MouseEvent<HTMLButtonElement>) => {
										event.stopPropagation();
										setIsDeleteOpen(true);
									}}
									aria-label="Delete organization"
								>
									<Trash2 className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Delete</TooltipContent>
						</Tooltip>
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
							<>
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
								<div className="app-surface">
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											setIsMembersExpanded((current) => !current);
										}}
										className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
									>
										<div className="min-w-0">
											<p className="font-medium text-sm">Members</p>
											<p className="text-muted-foreground text-xs">
												Members: {membersCount}
											</p>
										</div>
										<span className="rounded-md p-1 transition-colors hover:bg-background/60">
											<ChevronDown
												className={cn(
													"size-4 shrink-0 text-muted-foreground transition-transform duration-200",
													isMembersExpanded && "rotate-180",
												)}
											/>
										</span>
									</button>

									{isMembersExpanded ? (
										<div className="app-surface-divider space-y-2 px-4 py-3">
											{membersCount === 0 ? (
												<div className="app-surface border-dashed px-3 py-4 text-center text-muted-foreground text-sm">
													No members found.
												</div>
											) : (
												members.map((member, index) => {
													const memberKey = getMemberKey(member, String(index));
													const resolvedRole =
														memberRoleOverrides[memberKey ?? String(index)] ??
														member.role ??
														"member";

													return (
														<MemberRow
															key={member.userId ?? member.user?.id ?? index}
															member={member}
															role={resolvedRole}
															canManageMembers={canManageMembers}
															isUpdatingRole={
																memberActionType === "role-update" &&
																memberActionKey === getMemberKey(member)
															}
															isRemovingMember={
																memberActionType === "remove" &&
																memberActionKey === getMemberKey(member)
															}
															onRoleChange={handleUpdateMemberRole}
															onRequestRemove={setMemberPendingRemoval}
														/>
													);
												})
											)}
										</div>
									) : null}
								</div>
							</>
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

			<Dialog open={isLeaveConfirmOpen} onOpenChange={setIsLeaveConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Leave organization</DialogTitle>
						<DialogDescription>
							{`You will leave ${organization.name} and lose access to its members and settings.`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsLeaveConfirmOpen(false)}
							disabled={isLeavePending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								void handleLeave();
							}}
							disabled={isLeavePending}
						>
							{isLeavePending ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Leaving...
								</>
							) : (
								"Leave organization"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(memberPendingRemoval)}
				onOpenChange={(open) => {
					if (!open && memberActionType !== "remove") {
						setMemberPendingRemoval(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove member</DialogTitle>
						<DialogDescription>
							{`This will remove ${
								memberPendingRemoval?.user?.email ?? "this member"
							} from ${organization.name}.`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setMemberPendingRemoval(null)}
							disabled={memberActionType === "remove"}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								if (memberPendingRemoval) {
									void handleRemoveMember(memberPendingRemoval);
								}
							}}
							disabled={memberActionType === "remove"}
						>
							{memberActionType === "remove" ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Removing...
								</>
							) : (
								"Remove member"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
