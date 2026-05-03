import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Check, Loader2, MailPlus, Plus, RefreshCw, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/web/components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { CopyButton } from "@/web/components/ui/copy-button";
import { LabeledSwitch } from "@/web/components/ui/labeled-switch";
import { Separator } from "@/web/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { authClient } from "@/web/lib/auth-client";
import { copyToClipboard } from "@/web/utils/clipboard";
import type { OrganizationListItem } from "../-components/organizations/types";
import { SettingsError } from "../-components/settings-error";
import { SettingsSectionSkeleton } from "../-components/settings-section-skeleton";

export const Route = createFileRoute("/settings/invitations")({
	component: InvitationsSettingsLayout,
	pendingComponent: SettingsSectionSkeleton,
	errorComponent: SettingsError,
});

type ReceivedInvitation = NonNullable<
	Awaited<
		ReturnType<typeof authClient.organization.listUserInvitations>
	>["data"]
>[number];

type SentInvitation = NonNullable<
	Awaited<ReturnType<typeof authClient.organization.listInvitations>>["data"]
>[number];

function InvitationsSettingsLayout() {
	const auth = useAuth();
	const queryClient = useQueryClient();
	const [isManagementMode, setIsManagementMode] = useState(false);
	const activeOrganizationId = auth.session?.session?.activeOrganizationId;

	const { data: activeMemberRole } = authClient.useActiveMemberRole();
	const { data: organizations } = authClient.useListOrganizations();

	const canManageInvitations =
		activeMemberRole?.role === "admin" || activeMemberRole?.role === "owner";

	const organizationNameById = useMemo(() => {
		return new Map(
			(organizations ?? []).map((organization: OrganizationListItem) => [
				organization.id,
				organization.name,
			]),
		);
	}, [organizations]);

	const receivedInvitationsQuery = useQuery({
		queryKey: ["better-auth", "organization", "received-invitations"],
		retry: false,
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.listUserInvitations();

			if (error) {
				throw new Error(error.message || "Failed to load invitations");
			}

			return (data ?? []).toSorted((a, b) => b.id.localeCompare(a.id));
		},
	});

	const sentInvitationsQuery = useQuery({
		queryKey: [
			"better-auth",
			"organization",
			"sent-invitations",
			activeOrganizationId ?? "no-active-org",
		],
		enabled: canManageInvitations && isManagementMode && !!activeOrganizationId,
		retry: false,
		queryFn: async () => {
			const { data, error } = await authClient.organization.listInvitations({
				query: {
					organizationId: activeOrganizationId ?? undefined,
				},
			});

			if (error) {
				throw new Error(error.message || "Failed to load invitations");
			}

			return (data ?? []).toSorted((a, b) => b.id.localeCompare(a.id));
		},
	});

	const pendingInvitationNamesQuery = useQuery({
		queryKey: [
			"better-auth",
			"organization",
			"pending-invitation-names",
			(receivedInvitationsQuery.data ?? [])
				.filter((invitation) => invitation.status === "pending")
				.map((invitation) => invitation.id),
		],
		enabled: (receivedInvitationsQuery.data?.length ?? 0) > 0,
		retry: false,
		queryFn: async () => {
			const pendingInvitations = (receivedInvitationsQuery.data ?? []).filter(
				(invitation) => invitation.status === "pending",
			);

			const entries = await Promise.all(
				pendingInvitations.map(async (invitation) => {
					try {
						const { data } = await authClient.organization.getInvitation({
							query: {
								id: invitation.id,
							},
						});

						return [
							invitation.id,
							{
								organizationName: data?.organizationName,
							},
						] as const;
					} catch {
						return [invitation.id, { organizationName: undefined }] as const;
					}
				}),
			);

			return Object.fromEntries(entries);
		},
	});

	const refreshCurrentView = async () => {
		if (canManageInvitations && isManagementMode) {
			await queryClient.invalidateQueries({
				queryKey: ["better-auth", "organization", "sent-invitations"],
			});
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: ["better-auth", "organization", "received-invitations"],
		});
		await queryClient.invalidateQueries({
			queryKey: ["better-auth", "organization", "pending-invitation-names"],
		});
	};

	return (
		<>
			<Card>
				<CardHeader className="relative gap-3 pr-20">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<MailPlus className="size-5" />
							<CardTitle>Invitations</CardTitle>
						</div>
						<CardDescription>
							{canManageInvitations && isManagementMode
								? "Manage sent invitations for the active organization."
								: "Review invitations addressed to you across organizations."}
						</CardDescription>
						{canManageInvitations ? (
							<LabeledSwitch
								label="Management view:"
								checked={isManagementMode}
								onCheckedChange={setIsManagementMode}
								className="h-4 w-6.5"
							/>
						) : null}
					</div>

					<div className="absolute top-0 right-6 flex items-center gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={() => {
								void refreshCurrentView();
							}}
							className="size-8 rounded-md"
							aria-label="Refresh invitations"
						>
							<RefreshCw className="size-3.5" />
						</Button>

						{canManageInvitations && isManagementMode ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => {
									toast.message("Invite member flow coming next");
								}}
								className="h-8 rounded-md px-3 text-xs"
							>
								<Plus className="size-3.5" />
								Invite member
							</Button>
						) : null}
					</div>
				</CardHeader>
				<Separator />

				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">
							{canManageInvitations && isManagementMode
								? (sentInvitationsQuery.data?.length ?? 0)
								: (receivedInvitationsQuery.data?.length ?? 0)}{" "}
							invitation
							{(canManageInvitations && isManagementMode
								? (sentInvitationsQuery.data?.length ?? 0)
								: (receivedInvitationsQuery.data?.length ?? 0)) === 1
								? ""
								: "s"}
						</Badge>
					</div>

					{canManageInvitations && isManagementMode ? (
						<ManagementInvitationsSection
							activeOrganizationId={activeOrganizationId}
							invitations={sentInvitationsQuery.data ?? []}
							isPending={sentInvitationsQuery.isPending}
							errorMessage={sentInvitationsQuery.error?.message}
							onRefresh={refreshCurrentView}
						/>
					) : (
						<UserInvitationsSection
							invitations={receivedInvitationsQuery.data ?? []}
							isPending={receivedInvitationsQuery.isPending}
							errorMessage={receivedInvitationsQuery.error?.message}
							pendingInvitationNames={pendingInvitationNamesQuery.data ?? {}}
							organizationNameById={organizationNameById}
							onRefresh={refreshCurrentView}
						/>
					)}
				</CardContent>
			</Card>

			<Outlet />
		</>
	);
}

function ManagementInvitationsSection({
	activeOrganizationId,
	invitations,
	isPending,
	errorMessage,
	onRefresh,
}: {
	activeOrganizationId?: string | null;
	invitations: SentInvitation[];
	isPending: boolean;
	errorMessage?: string;
	onRefresh: () => Promise<void>;
}) {
	if (!activeOrganizationId) {
		return (
			<div className="app-surface border-dashed px-4 py-8 text-center">
				<p className="font-medium text-sm">
					Select an active organization first.
				</p>
				<p className="mt-2 text-muted-foreground text-sm">
					Management view is scoped to the currently active organization.
				</p>
			</div>
		);
	}

	if (isPending) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<Loader2 className="size-4 animate-spin" />
				Loading invitations...
			</div>
		);
	}

	if (errorMessage) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Failed to load invitations</AlertTitle>
				<AlertDescription>{errorMessage}</AlertDescription>
			</Alert>
		);
	}

	if (invitations.length === 0) {
		return (
			<div className="app-surface border-dashed px-4 py-8 text-center">
				<p className="font-medium text-sm">No invitations found.</p>
				<p className="mt-2 text-muted-foreground text-sm">
					Sent invitations for the active organization will appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="app-surface">
			{invitations.map((invitation, index) => (
				<div key={invitation.id}>
					<ManagementInvitationRow
						invitation={invitation}
						onRefresh={onRefresh}
					/>
					{index < invitations.length - 1 ? (
						<Separator className="bg-border/70" />
					) : null}
				</div>
			))}
		</div>
	);
}

function UserInvitationsSection({
	invitations,
	isPending,
	errorMessage,
	pendingInvitationNames,
	organizationNameById,
	onRefresh,
}: {
	invitations: ReceivedInvitation[];
	isPending: boolean;
	errorMessage?: string;
	pendingInvitationNames: Record<
		string,
		{
			organizationName?: string;
		}
	>;
	organizationNameById: Map<string, string>;
	onRefresh: () => Promise<void>;
}) {
	if (isPending) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<Loader2 className="size-4 animate-spin" />
				Loading invitations...
			</div>
		);
	}

	if (errorMessage) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Failed to load invitations</AlertTitle>
				<AlertDescription>{errorMessage}</AlertDescription>
			</Alert>
		);
	}

	if (invitations.length === 0) {
		return (
			<div className="app-surface border-dashed px-4 py-8 text-center">
				<p className="font-medium text-sm">No invitations found.</p>
				<p className="mt-2 text-muted-foreground text-sm">
					Invitations addressed to you will appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="app-surface">
			{invitations.map((invitation, index) => (
				<div key={invitation.id}>
					<UserInvitationRow
						invitation={invitation}
						organizationName={
							pendingInvitationNames[invitation.id]?.organizationName ??
							organizationNameById.get(invitation.organizationId) ??
							invitation.organizationId
						}
						onRefresh={onRefresh}
					/>
					{index < invitations.length - 1 ? (
						<Separator className="bg-border/70" />
					) : null}
				</div>
			))}
		</div>
	);
}

function ManagementInvitationRow({
	invitation,
	onRefresh,
}: {
	invitation: SentInvitation;
	onRefresh: () => Promise<void>;
}) {
	const queryClient = useQueryClient();
	const [isExpanded, setIsExpanded] = useState(false);

	const cancelInvitationMutation = useMutation({
		mutationFn: async () => {
			const { data, error } = await authClient.organization.cancelInvitation({
				invitationId: invitation.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to cancel invitation");
			}

			return data;
		},
		onSuccess: async () => {
			await onRefresh();
			await queryClient.invalidateQueries({
				queryKey: ["better-auth", "organization", "sent-invitations"],
			});
			toast.success("Invitation canceled successfully");
		},
		onError: (error: { message?: string }) => {
			toast.error(error.message || "Failed to cancel invitation");
		},
	});

	const handleCopyLink = async () => {
		try {
			const invitationLink = new URL(
				`/settings/invitations/${invitation.id}`,
				import.meta.env.VITE_WEB_URL,
			).toString();

			await copyToClipboard(invitationLink);
			toast.success("Invitation link copied");
		} catch {
			toast.error("Failed to copy invitation link");
		}
	};

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<button
					type="button"
					onClick={() => setIsExpanded((current) => !current)}
					className="min-w-0 flex-1 text-left"
				>
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="truncate font-semibold text-base">
							{invitation.email}
						</h3>
						<Badge
							variant={
								invitation.status === "pending" ? "secondary" : "outline"
							}
						>
							{invitation.status}
						</Badge>
					</div>
				</button>

				<div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
					<CopyButton size="sm" variant="outline" onCopy={handleCopyLink}>
						Link
					</CopyButton>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={(event: MouseEvent<HTMLButtonElement>) => {
									event.stopPropagation();
									cancelInvitationMutation.mutate();
								}}
								disabled={cancelInvitationMutation.isPending}
								aria-label="Cancel invitation"
							>
								{cancelInvitationMutation.isPending ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<X className="size-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Cancel</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{isExpanded ? (
				<div className="space-y-3">
					<div className="grid gap-2 sm:grid-cols-2">
						<InvitationDetail label="Role" value={invitation.role} />
						<InvitationDetail
							label="Organization"
							value={invitation.organizationId}
						/>
						<InvitationDetail
							label="Created at"
							value={formatInvitationDate(invitation.createdAt)}
						/>
						<InvitationDetail
							label="Expires at"
							value={formatInvitationDate(invitation.expiresAt)}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

function UserInvitationRow({
	invitation,
	organizationName,
	onRefresh,
}: {
	invitation: ReceivedInvitation;
	organizationName: string;
	onRefresh: () => Promise<void>;
}) {
	const queryClient = useQueryClient();
	const [isExpanded, setIsExpanded] = useState(false);

	const acceptInvitationMutation = useMutation({
		mutationFn: async () => {
			const { data, error } = await authClient.organization.acceptInvitation({
				invitationId: invitation.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to accept invitation");
			}

			return data;
		},
		onSuccess: async () => {
			await onRefresh();
			await queryClient.invalidateQueries();
			toast.success("Invitation accepted successfully");
		},
		onError: (error: { message?: string }) => {
			toast.error(error.message || "Failed to accept invitation");
		},
	});

	const rejectInvitationMutation = useMutation({
		mutationFn: async () => {
			const { data, error } = await authClient.organization.rejectInvitation({
				invitationId: invitation.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to reject invitation");
			}

			return data;
		},
		onSuccess: async () => {
			await onRefresh();
			await queryClient.invalidateQueries({
				queryKey: ["better-auth", "organization", "received-invitations"],
			});
			toast.success("Invitation rejected successfully");
		},
		onError: (error: { message?: string }) => {
			toast.error(error.message || "Failed to reject invitation");
		},
	});

	return (
		<button
			type="button"
			onClick={() => setIsExpanded((current) => !current)}
			className="flex w-full flex-col gap-4 p-4 text-left"
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-semibold text-base">
						{organizationName}
					</h3>
				</div>

				<div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
					{invitation.status === "pending" ? (
						<>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={(event: MouseEvent<HTMLButtonElement>) => {
									event.stopPropagation();
									acceptInvitationMutation.mutate();
								}}
								disabled={acceptInvitationMutation.isPending}
							>
								{acceptInvitationMutation.isPending ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Accepting...
									</>
								) : (
									<>
										<Check className="size-4" />
										Accept
									</>
								)}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={(event: MouseEvent<HTMLButtonElement>) => {
									event.stopPropagation();
									rejectInvitationMutation.mutate();
								}}
								disabled={rejectInvitationMutation.isPending}
							>
								{rejectInvitationMutation.isPending ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Rejecting...
									</>
								) : (
									<>
										<X className="size-4" />
										Reject
									</>
								)}
							</Button>
						</>
					) : (
						<Badge variant="outline">{invitation.status}</Badge>
					)}
				</div>
			</div>

			{isExpanded ? (
				<div className="space-y-3">
					<div className="grid gap-2 sm:grid-cols-2">
						<InvitationDetail label="Role" value={invitation.role} />
						<InvitationDetail
							label="Organization"
							value={invitation.organizationId}
						/>
						<InvitationDetail label="Email" value={invitation.email} />
						<InvitationDetail
							label="Expires at"
							value={formatInvitationDate(invitation.expiresAt)}
						/>
					</div>
				</div>
			) : null}
		</button>
	);
}

function InvitationDetail({ label, value }: { label: string; value: string }) {
	return (
		<div className="app-surface group relative px-3 py-2.5">
			<p className="pr-8 text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
				{label}
			</p>
			<p className="mt-1 break-words text-sm leading-5">{value}</p>
			<CopyButton
				onCopy={async () => {
					await navigator.clipboard.writeText(value);
					toast.success(`${label} copied`);
				}}
				aria-label={`Copy ${label}`}
				className="absolute top-1/2 right-2 size-7 -translate-y-1/2 opacity-0 shadow-none transition-opacity hover:shadow-sm group-hover:opacity-100"
			/>
		</div>
	);
}

function formatInvitationDate(value: string | Date | undefined) {
	if (!value) return "Unavailable";

	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}
