import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	Building2,
	Clock3,
	Loader2,
	Mail,
	ShieldCheck,
	ShieldX,
	Users,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
import { Button } from "@/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { authClient } from "@/web/lib/auth-client";
import { cn } from "@/web/utils/cn";

interface InvitationDecisionFormProps {
	invitationId: string;
}

interface SubmissionNotice {
	tone: "success" | "error";
	message: string;
}

type InvitationAction = "accept" | "reject";

type InvitationDetails = NonNullable<
	Awaited<ReturnType<typeof authClient.organization.getInvitation>>["data"]
>;

type InvitationActionResult = NonNullable<
	Awaited<ReturnType<typeof authClient.organization.acceptInvitation>>["data"]
>;

function getInvitationQueryOptions(invitationId: string) {
	return {
		queryKey: ["better-auth", "organization", "invitation", invitationId],
		retry: false,
		queryFn: async (): Promise<InvitationDetails> => {
			const { data, error } = await authClient.organization.getInvitation({
				query: {
					id: invitationId,
				},
			});

			if (error) {
				throw new Error(error.message || "Failed to load invitation details");
			}

			if (!data) {
				throw new Error("Invitation details are unavailable");
			}

			return data;
		},
	} as const;
}

function formatInvitationDate(value: string | Date) {
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function getActionMeta(action: InvitationAction) {
	return action === "accept"
		? {
				successMessage: "Invitation accepted successfully",
				errorMessage: "Failed to accept invitation",
			}
		: {
				successMessage: "Invitation rejected successfully",
				errorMessage: "Failed to reject invitation",
			};
}

export function InvitationDecisionForm({
	invitationId,
}: InvitationDecisionFormProps) {
	const navigate = useNavigate();
	const [notice, setNotice] = useState<SubmissionNotice | null>(null);
	const [pendingAction, setPendingAction] = useState<InvitationAction | null>(
		null,
	);

	const invitationQuery = useQuery(getInvitationQueryOptions(invitationId));

	const actionMutation = useMutation({
		mutationFn: async (
			action: InvitationAction,
		): Promise<InvitationActionResult | null> => {
			const result =
				action === "accept"
					? await authClient.organization.acceptInvitation({
							invitationId,
						})
					: await authClient.organization.rejectInvitation({
							invitationId,
						});
			const actionMeta = getActionMeta(action);

			if (result.error) {
				throw new Error(result.error.message || actionMeta.errorMessage);
			}

			return result.data;
		},
		onSuccess: async (_, action) => {
			const actionMeta = getActionMeta(action);
			setNotice({
				tone: "success",
				message: actionMeta.successMessage,
			});
			toast.success(actionMeta.successMessage);
			await navigate({
				to: "/settings/invitations",
			});
		},
		onError: (error: { message?: string }) => {
			const fallbackMessage = pendingAction
				? getActionMeta(pendingAction).errorMessage
				: "Failed to process invitation";
			const message = error.message || fallbackMessage;
			setNotice({
				tone: "error",
				message,
			});
			toast.error(message);
		},
		onSettled: () => {
			setPendingAction(null);
		},
	});

	const invitation = invitationQuery.data;
	const isBusy = invitationQuery.isPending || actionMutation.isPending;

	return (
		<div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-background/55 px-4 py-6 backdrop-blur-sm">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="invitation-decision-title"
				className="w-full max-w-xl"
			>
				<Card className="overflow-hidden">
					<CardHeader className="app-surface-divider space-y-5 px-6 py-5">
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-2">
								<p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
									Organization invitation
								</p>
								<CardTitle
									id="invitation-decision-title"
									className="font-semibold text-2xl tracking-tight"
								>
									Invitation details
								</CardTitle>
								<CardDescription className="max-w-md text-sm leading-6">
									Decide whether you want to accept or reject this invitation.
								</CardDescription>
							</div>

							<Button
								asChild
								variant="ghost"
								size="icon"
								className="shrink-0"
								aria-label="Close invitation dialog"
							>
								<Link to="/settings/invitations">
									<X />
								</Link>
							</Button>
						</div>
					</CardHeader>

					<CardContent className="space-y-6 px-6 py-5">
						{notice ? (
							<Alert
								variant={notice.tone === "error" ? "destructive" : "default"}
							>
								{notice.tone === "success" ? (
									<ShieldCheck className="size-4" />
								) : (
									<ShieldX className="size-4" />
								)}
								<AlertTitle>
									{notice.tone === "success"
										? "Action completed"
										: "Action failed"}
								</AlertTitle>
								<AlertDescription>{notice.message}</AlertDescription>
							</Alert>
						) : null}

						{invitationQuery.isPending ? (
							<div className="space-y-4">
								<div className="h-5 w-32 animate-pulse rounded bg-muted/70" />
								<div className="space-y-3">
									<div className="h-14 animate-pulse rounded-lg bg-muted/60" />
									<div className="h-14 animate-pulse rounded-lg bg-muted/60" />
									<div className="h-14 animate-pulse rounded-lg bg-muted/60" />
									<div className="h-14 animate-pulse rounded-lg bg-muted/60" />
								</div>
							</div>
						) : invitationQuery.error ? (
							<Alert variant="destructive">
								<ShieldX className="size-4" />
								<AlertTitle>Unable to load this invitation</AlertTitle>
								<AlertDescription>
									{invitationQuery.error.message}
								</AlertDescription>
							</Alert>
						) : invitation ? (
							<>
								<div className="grid gap-2 sm:grid-cols-2">
									<InvitationInfoCard
										icon={Building2}
										label="Organization"
										value={invitation.organizationName}
										hint={`/${invitation.organizationSlug}`}
										showHint
										className="sm:col-span-2"
									/>
									<InvitationInfoCard
										icon={Users}
										label="Role"
										value={invitation.role}
									/>
									<InvitationInfoCard
										icon={Mail}
										label="Invited email"
										value={invitation.email}
									/>
									<InvitationInfoCard
										icon={Clock3}
										label="Expires at"
										value={formatInvitationDate(invitation.expiresAt)}
									/>
									<InvitationInfoCard
										icon={Mail}
										label="Invited by"
										value={invitation.inviterEmail}
									/>
								</div>

								<form
									onSubmit={(event) => {
										event.preventDefault();
									}}
									className="space-y-2"
								>
									<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
										<Button
											type="button"
											variant="ghost"
											disabled={isBusy}
											className={cn(
												"min-w-32 justify-center rounded-lg border border-stone-200 bg-[color:var(--surface-background)]/80 text-foreground hover:bg-muted/70 hover:text-foreground dark:border-stone-800 dark:bg-stone-950/80",
											)}
											onClick={() => {
												setNotice(null);
												setPendingAction("reject");
												actionMutation.mutate("reject");
											}}
										>
											{actionMutation.isPending &&
											pendingAction === "reject" ? (
												<>
													<Loader2 className="animate-spin" />
													Processing...
												</>
											) : (
												"Reject invite"
											)}
										</Button>
										<Button
											type="button"
											disabled={isBusy}
											variant="ghost"
											className={cn(
												"min-w-32 justify-center rounded-lg border border-stone-200 bg-[color:var(--surface-background)]/80 text-foreground hover:bg-muted/70 dark:border-stone-800 dark:bg-stone-950/80",
											)}
											onClick={() => {
												setNotice(null);
												setPendingAction("accept");
												actionMutation.mutate("accept");
											}}
										>
											{actionMutation.isPending &&
											pendingAction === "accept" ? (
												<>
													<Loader2 className="animate-spin" />
													Processing...
												</>
											) : (
												"Accept invite"
											)}
										</Button>
									</div>
								</form>
							</>
						) : (
							<Alert variant="destructive">
								<ShieldX className="size-4" />
								<AlertTitle>Invitation unavailable</AlertTitle>
								<AlertDescription>
									We couldn't find the invitation details for this link.
								</AlertDescription>
							</Alert>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

interface InvitationInfoCardProps {
	icon: typeof Building2;
	label: string;
	value: string;
	hint?: string;
	showHint?: boolean;
	className?: string;
}

function InvitationInfoCard({
	icon: Icon,
	label,
	value,
	hint,
	showHint = false,
	className,
}: InvitationInfoCardProps) {
	return (
		<div
			className={cn("app-surface flex items-start gap-3 px-3 py-3", className)}
		>
			<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground">
				<Icon className="size-3.5" />
			</div>
			<div className="min-w-0 space-y-0.5">
				<div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					<span>{label}</span>
				</div>
				<p className="truncate font-medium text-[15px] leading-5">{value}</p>
				{showHint && hint ? (
					<p className="truncate text-muted-foreground text-sm">{hint}</p>
				) : null}
			</div>
		</div>
	);
}
