import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import {
	Ban,
	KeyRound,
	Loader2,
	LogIn,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Shield,
	ShieldCheck,
	Trash2,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/web/components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { Checkbox } from "@/web/components/ui/checkbox";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { CopyButton } from "@/web/components/ui/copy-button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/web/components/ui/dialog";
import { Input } from "@/web/components/ui/input";
import { Label } from "@/web/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { Separator } from "@/web/components/ui/separator";
import { Textarea } from "@/web/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { authClient } from "@/web/lib/auth-client";
import { CreateUserDialog } from "./-components/admin/create-user-dialog";
import {
	ADMIN_ROLE_OPTIONS,
	type AdminBanForm,
	type AdminEditableUserForm,
	type AdminPasswordForm,
	type AdminRole,
	type AdminUserListItem,
	type AdminUserSession,
} from "./-components/admin/types";
import { DetailCard } from "./-components/detail-card";
import { SettingsError } from "./-components/settings-error";
import { SettingsSectionSkeleton } from "./-components/settings-section-skeleton";

const USERS_QUERY_KEY = ["better-auth", "admin", "users"] as const;
const USER_SESSIONS_QUERY_KEY = [
	"better-auth",
	"admin",
	"user-sessions",
] as const;
const PAGE_SIZE = 10;

type AdminUsersQueryState = {
	page: number;
	searchValue: string;
};

const DEFAULT_USERS_QUERY_STATE: AdminUsersQueryState = {
	page: 0,
	searchValue: "",
};

const INITIAL_BAN_FORM: AdminBanForm = {
	banReason: "",
	banExpiresInHours: "",
	isPermanent: false,
};

function isAdminRole(value: string): value is AdminRole {
	return ADMIN_ROLE_OPTIONS.some((role) => role === value);
}

function normalizeRole(role: string | string[] | null | undefined): AdminRole {
	if (Array.isArray(role)) {
		const firstRole = role[0];
		return firstRole && isAdminRole(firstRole) ? firstRole : "user";
	}

	return role && isAdminRole(role) ? role : "user";
}

function formatDate(value: Date | string | null | undefined) {
	if (!value) {
		return "unknown";
	}

	const date = value instanceof Date ? value : new Date(value);

	if (Number.isNaN(date.getTime())) {
		return "unknown";
	}

	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

function getBanReasonValue(user: AdminUserListItem) {
	if (!user.banned) {
		return null;
	}

	return user.banReason || "No ban reason";
}

function getBanExpiresValue(user: AdminUserListItem) {
	if (!user.banned) {
		return null;
	}

	if (!user.banExpires) {
		return "Permanent";
	}

	return formatDate(user.banExpires);
}

function getUsersQueryOptions(state: AdminUsersQueryState) {
	const trimmedSearchValue = state.searchValue.trim();

	return queryOptions({
		queryKey: [...USERS_QUERY_KEY, state] as const,
		retry: false,
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUsers({
				query: {
					searchField: "email",
					searchOperator: "contains",
					searchValue: trimmedSearchValue || undefined,
					sortBy: "createdAt",
					sortDirection: "desc",
					limit: PAGE_SIZE,
					offset: state.page * PAGE_SIZE,
				},
			});

			if (error) {
				throw new Error(error.message || "Failed to load users");
			}

			return data ?? { users: [], total: 0 };
		},
	});
}

function getUserSessionsQueryOptions(userId: string) {
	return queryOptions({
		queryKey: [...USER_SESSIONS_QUERY_KEY, userId] as const,
		retry: false,
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUserSessions({
				userId,
			});

			if (error) {
				throw new Error(error.message || "Failed to load sessions");
			}

			return data?.sessions ?? [];
		},
	});
}

function getMutationErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

export const Route = createFileRoute("/settings/admin")({
	beforeLoad: async ({ context }) => {
		const { data: session } = await context.authClient.getSession();

		if (session?.user?.role !== "admin") {
			throw notFound();
		}
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			getUsersQueryOptions(DEFAULT_USERS_QUERY_STATE),
		);
	},
	component: AdminSettingsPage,
	pendingComponent: SettingsSectionSkeleton,
	errorComponent: SettingsError,
});

function AdminSettingsPage() {
	const auth = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [usersState, setUsersState] = useState(DEFAULT_USERS_QUERY_STATE);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<AdminUserListItem | null>(
		null,
	);
	const [banTarget, setBanTarget] = useState<AdminUserListItem | null>(null);
	const [banForm, setBanForm] = useState(INITIAL_BAN_FORM);

	const usersQuery = useQuery(getUsersQueryOptions(usersState));
	const users = usersQuery.data?.users ?? [];
	const totalUsers = usersQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
	const currentUserId = auth.session?.user?.id ?? null;
	const impersonatedByUserId = auth.session?.session?.impersonatedBy ?? null;

	useEffect(() => {
		if (!banTarget) {
			setBanForm(INITIAL_BAN_FORM);
			return;
		}

		setBanForm({
			banReason:
				typeof banTarget.banReason === "string" ? banTarget.banReason : "",
			banExpiresInHours: "",
			isPermanent: Boolean(banTarget.banned && !banTarget.banExpires),
		});
	}, [banTarget]);

	const refreshUsers = async () => {
		await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
	};

	const setRoleMutation = useMutation({
		mutationFn: async ({
			role,
			userId,
		}: {
			role: AdminRole;
			userId: string;
		}) => {
			const { error } = await authClient.admin.setRole({ userId, role });

			if (error) {
				throw new Error(error.message || "Failed to update role");
			}
		},
		onSuccess: async () => {
			toast.success("Role updated");
			await refreshUsers();
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to update role"));
		},
	});

	const removeUserMutation = useMutation({
		mutationFn: async (userId: string) => {
			const { error } = await authClient.admin.removeUser({ userId });

			if (error) {
				throw new Error(error.message || "Failed to remove user");
			}
		},
		onSuccess: async () => {
			setDeleteTarget(null);
			toast.success("User removed");
			await refreshUsers();
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to remove user"));
		},
	});

	const banMutation = useMutation({
		mutationFn: async ({
			userId,
			form,
		}: {
			userId: string;
			form: AdminBanForm;
		}) => {
			const hoursValue = form.banExpiresInHours.trim();
			let banExpiresIn: number | undefined;

			if (!form.isPermanent) {
				const parsedHours = Number(hoursValue);

				if (!hoursValue || !Number.isFinite(parsedHours) || parsedHours <= 0) {
					throw new Error("Expire in must be a positive number of hours");
				}

				banExpiresIn = parsedHours * 60 * 60;
			}

			const { error } = await authClient.admin.banUser({
				userId,
				banReason: form.banReason.trim() || undefined,
				banExpiresIn,
			});

			if (error) {
				throw new Error(error.message || "Failed to ban user");
			}
		},
		onSuccess: async () => {
			setBanTarget(null);
			toast.success("User banned");
			await refreshUsers();
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to ban user"));
		},
	});

	const stopImpersonatingMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.admin.stopImpersonating();

			if (error) {
				throw new Error(error.message || "Failed to stop impersonating");
			}
		},
		onSuccess: async () => {
			toast.success("Returned to admin session");
			await router.invalidate();
			await refreshUsers();
		},
		onError: (error) => {
			toast.error(
				getMutationErrorMessage(error, "Failed to stop impersonating"),
			);
		},
	});

	return (
		<>
			<Card>
				<CardHeader className="relative gap-3 pr-20">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Shield className="size-5" />
							<CardTitle>Admin</CardTitle>
						</div>
						<CardDescription>Manage users.</CardDescription>
					</div>

					<div className="absolute top-0 right-6 flex items-center gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={() => {
								void refreshUsers();
							}}
							className="size-8 rounded-md"
							aria-label="Refresh users"
						>
							<RefreshCw className="size-3.5" />
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setIsCreateOpen(true)}
							className="h-8 rounded-md px-3 text-xs"
						>
							<Plus className="size-3.5" />
							Create user
						</Button>
					</div>
				</CardHeader>
				<Separator />

				<CardContent className="space-y-4">
					{impersonatedByUserId ? (
						<Alert>
							<ShieldCheck className="size-4" />
							<AlertTitle>Impersonation mode active</AlertTitle>
							<AlertDescription className="flex flex-wrap items-center gap-3">
								<span>Impersonated by admin ID {impersonatedByUserId}.</span>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => void stopImpersonatingMutation.mutateAsync()}
									disabled={stopImpersonatingMutation.isPending}
								>
									{stopImpersonatingMutation.isPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : null}
									Stop impersonating
								</Button>
							</AlertDescription>
						</Alert>
					) : null}

					<AdminUsersSection
						users={users}
						totalUsers={totalUsers}
						totalPages={totalPages}
						usersState={usersState}
						usersQueryError={usersQuery.error?.message}
						isUsersPending={usersQuery.isPending}
						currentUserId={currentUserId}
						expandedUserId={expandedUserId}
						isUpdatingRole={setRoleMutation.isPending}
						updatingRoleUserId={setRoleMutation.variables?.userId}
						isDeleting={removeUserMutation.isPending}
						deletingUserId={removeUserMutation.variables ?? null}
						onToggleExpanded={(userId) =>
							setExpandedUserId((current) =>
								current === userId ? null : userId,
							)
						}
						onSearchChange={(searchValue) =>
							setUsersState({
								page: 0,
								searchValue,
							})
						}
						onPreviousPage={() =>
							setUsersState((current) => ({
								...current,
								page: Math.max(0, current.page - 1),
							}))
						}
						onNextPage={() =>
							setUsersState((current) => ({
								...current,
								page: current.page + 1,
							}))
						}
						onRoleChange={(userId, role) => {
							void setRoleMutation.mutateAsync({ userId, role });
						}}
						onDelete={(user) => setDeleteTarget(user)}
						onBan={(user) => setBanTarget(user)}
					/>
				</CardContent>
			</Card>

			<CreateUserDialog
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				onSuccess={refreshUsers}
			/>

			<Dialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete user</DialogTitle>
						<DialogDescription>
							This permanently removes the selected account.
						</DialogDescription>
					</DialogHeader>

					<div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
						<p className="font-medium">
							{deleteTarget?.email ?? "Selected user"} will be deleted.
						</p>
					</div>

					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setDeleteTarget(null)}
							disabled={removeUserMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								if (!deleteTarget) {
									return;
								}

								void removeUserMutation.mutateAsync(deleteTarget.id);
							}}
							disabled={removeUserMutation.isPending}
						>
							{removeUserMutation.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : null}
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={banTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setBanTarget(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Ban user</DialogTitle>
						<DialogDescription>
							Add a reason and choose a temporary or permanent ban.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="admin-ban-reason">Reason</Label>
							<Textarea
								id="admin-ban-reason"
								value={banForm.banReason}
								onChange={(event) =>
									setBanForm((current) => ({
										...current,
										banReason: event.target.value,
									}))
								}
								placeholder="Describe why this user is being banned"
								disabled={banMutation.isPending}
							/>
						</div>

						<div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 px-4 py-3">
							<Checkbox
								id="admin-ban-permanent"
								checked={banForm.isPermanent}
								onCheckedChange={(checked) =>
									setBanForm((current) => ({
										...current,
										isPermanent: checked === true,
										banExpiresInHours:
											checked === true ? "" : current.banExpiresInHours,
									}))
								}
								disabled={banMutation.isPending}
							/>
							<div className="grid gap-1">
								<Label htmlFor="admin-ban-permanent">Permanent ban</Label>
								<p className="text-muted-foreground text-sm">
									Disable expiration and keep the user banned until manual
									unban.
								</p>
							</div>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="admin-ban-expire">Expire in</Label>
							<Input
								id="admin-ban-expire"
								value={banForm.banExpiresInHours}
								onChange={(event) =>
									setBanForm((current) => ({
										...current,
										banExpiresInHours: event.target.value,
									}))
								}
								placeholder="Hours"
								inputMode="numeric"
								disabled={banMutation.isPending || banForm.isPermanent}
							/>
						</div>
					</div>

					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setBanTarget(null)}
							disabled={banMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => {
								if (!banTarget) {
									return;
								}

								void banMutation.mutateAsync({
									userId: banTarget.id,
									form: banForm,
								});
							}}
							disabled={banMutation.isPending}
						>
							{banMutation.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : null}
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function AdminUsersSection({
	users,
	totalUsers,
	totalPages,
	usersState,
	usersQueryError,
	isUsersPending,
	currentUserId,
	expandedUserId,
	isUpdatingRole,
	updatingRoleUserId,
	isDeleting,
	deletingUserId,
	onToggleExpanded,
	onSearchChange,
	onPreviousPage,
	onNextPage,
	onRoleChange,
	onDelete,
	onBan,
}: {
	users: AdminUserListItem[];
	totalUsers: number;
	totalPages: number;
	usersState: AdminUsersQueryState;
	usersQueryError?: string;
	isUsersPending: boolean;
	currentUserId: string | null;
	expandedUserId: string | null;
	isUpdatingRole: boolean;
	updatingRoleUserId?: string;
	isDeleting: boolean;
	deletingUserId: string | null;
	onToggleExpanded: (userId: string) => void;
	onSearchChange: (searchValue: string) => void;
	onPreviousPage: () => void;
	onNextPage: () => void;
	onRoleChange: (userId: string, role: AdminRole) => void;
	onDelete: (user: AdminUserListItem) => void;
	onBan: (user: AdminUserListItem) => void;
}) {
	return (
		<div className="overflow-hidden rounded-xl border border-border/70 bg-card/70">
			<div className="px-4 py-4">
				<div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/30 px-4 py-3">
					<Search className="size-4 text-muted-foreground" />
					<Input
						value={usersState.searchValue}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder="Search user"
						className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
					/>
					<Badge variant="outline">{totalUsers} users</Badge>
				</div>
			</div>

			<Separator className="bg-border/70" />

			{isUsersPending ? (
				<div className="px-4 py-8">
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<Loader2 className="size-4 animate-spin" />
						Loading users...
					</div>
				</div>
			) : usersQueryError ? (
				<div className="px-4 py-4">
					<Alert variant="destructive">
						<AlertTitle>Failed to load users</AlertTitle>
						<AlertDescription>{usersQueryError}</AlertDescription>
					</Alert>
				</div>
			) : users.length === 0 ? (
				<div className="px-4 py-8 text-center">
					<p className="font-medium text-sm">No users found.</p>
					<p className="mt-2 text-muted-foreground text-sm">
						Try another search or create a new user.
					</p>
				</div>
			) : (
				<div>
					{users.map((user, index) => (
						<div key={user.id}>
							<AdminUserRow
								user={user}
								currentUserId={currentUserId}
								isExpanded={expandedUserId === user.id}
								isUpdatingRole={
									isUpdatingRole && updatingRoleUserId === user.id
								}
								isDeleting={isDeleting && deletingUserId === user.id}
								onToggleExpanded={() => onToggleExpanded(user.id)}
								onRoleChange={(role) => onRoleChange(user.id, role)}
								onDelete={() => onDelete(user)}
								onBan={() => onBan(user)}
							/>
							{index < users.length - 1 ? (
								<Separator className="bg-border/70" />
							) : null}
						</div>
					))}
				</div>
			)}

			<Separator className="bg-border/70" />

			<div className="flex items-center justify-between gap-3 px-4 py-4">
				<p className="text-muted-foreground text-sm">
					Page {usersState.page + 1} of {totalPages}
				</p>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onPreviousPage}
						disabled={usersState.page === 0}
					>
						Previous
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onNextPage}
						disabled={(usersState.page + 1) * PAGE_SIZE >= totalUsers}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}

function AdminUserRow({
	user,
	currentUserId,
	isExpanded,
	isUpdatingRole,
	isDeleting,
	onToggleExpanded,
	onRoleChange,
	onDelete,
	onBan,
}: {
	user: AdminUserListItem;
	currentUserId: string | null;
	isExpanded: boolean;
	isUpdatingRole: boolean;
	isDeleting: boolean;
	onToggleExpanded: () => void;
	onRoleChange: (role: AdminRole) => void;
	onDelete: () => void;
	onBan: () => void;
}) {
	const role = normalizeRole(user.role);
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
	const [isPasswordOpen, setIsPasswordOpen] = useState(false);
	const [isImpersonateOpen, setIsImpersonateOpen] = useState(false);
	const [profileForm, setProfileForm] = useState<AdminEditableUserForm>({
		email: user.email,
		name: user.name ?? "",
		image: typeof user.image === "string" ? user.image : "",
		emailVerified: Boolean(user.emailVerified),
	});
	const [passwordForm, setPasswordForm] = useState<AdminPasswordForm>({
		newPassword: "",
	});
	const sessionsQuery = useQuery({
		...getUserSessionsQueryOptions(user.id),
		enabled: isExpanded,
	});

	useEffect(() => {
		setProfileForm({
			email: user.email,
			name: user.name ?? "",
			image: typeof user.image === "string" ? user.image : "",
			emailVerified: Boolean(user.emailVerified),
		});
	}, [user.email, user.name, user.image, user.emailVerified]);

	const refreshUserState = async () => {
		await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
		await queryClient.invalidateQueries({
			queryKey: [...USER_SESSIONS_QUERY_KEY, user.id],
		});
	};

	const updateUserMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.admin.updateUser({
				userId: user.id,
				data: {
					email: profileForm.email.trim(),
					name: profileForm.name.trim(),
					image: profileForm.image.trim() || null,
					emailVerified: profileForm.emailVerified,
				},
			});

			if (error) {
				throw new Error(error.message || "Failed to update user");
			}
		},
		onSuccess: async () => {
			toast.success("User updated");
			await refreshUserState();
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to update user"));
		},
	});

	const setPasswordMutation = useMutation({
		mutationFn: async () => {
			const newPassword = passwordForm.newPassword.trim();

			if (!newPassword) {
				throw new Error("Password is required");
			}

			const { error } = await authClient.admin.setUserPassword({
				userId: user.id,
				newPassword,
			});

			if (error) {
				throw new Error(error.message || "Failed to set password");
			}
		},
		onSuccess: () => {
			setPasswordForm({ newPassword: "" });
			toast.success("Password updated");
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to set password"));
		},
	});

	const unbanMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.admin.unbanUser({
				userId: user.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to unban user");
			}
		},
		onSuccess: async () => {
			toast.success("User unbanned");
			await refreshUserState();
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to unban user"));
		},
	});

	const revokeAllSessionsMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.admin.revokeUserSessions({
				userId: user.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to revoke sessions");
			}
		},
		onSuccess: async () => {
			toast.success("All sessions revoked");
			await refreshUserState();
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to revoke sessions"));
		},
	});

	const revokeOneSessionMutation = useMutation({
		mutationFn: async (sessionToken: string) => {
			const { error } = await authClient.admin.revokeUserSession({
				sessionToken,
			});

			if (error) {
				throw new Error(error.message || "Failed to revoke session");
			}
		},
		onSuccess: async () => {
			toast.success("Session revoked");
			await refreshUserState();
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to revoke session"));
		},
	});

	const impersonateMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.admin.impersonateUser({
				userId: user.id,
			});

			if (error) {
				throw new Error(error.message || "Failed to impersonate user");
			}
		},
		onSuccess: async () => {
			toast.success("Impersonation started");
			await router.invalidate();
			await router.navigate({ to: "/" });
		},
		onError: (error) => {
			toast.error(getMutationErrorMessage(error, "Failed to impersonate user"));
		},
	});

	return (
		<div
			className="px-4 py-3 transition-colors"
			onClick={onToggleExpanded}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onToggleExpanded();
				}
			}}
			role="button"
			tabIndex={0}
			aria-expanded={isExpanded}
		>
			<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<p className="truncate font-medium text-sm">{user.email}</p>
						{user.banned ? (
							<Badge variant="destructive">banned</Badge>
						) : user.emailVerified ? (
							<Badge variant="outline">verified</Badge>
						) : null}
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-end gap-2">
					<div
						onClick={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
					>
						<Select
							value={role}
							onValueChange={(value) => {
								if (!isAdminRole(value)) {
									return;
								}

								onRoleChange(value);
							}}
							disabled={isUpdatingRole || user.id === currentUserId}
						>
							<SelectTrigger size="sm" className="min-w-32">
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								{ADMIN_ROLE_OPTIONS.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon"
								variant="outline"
								onClick={(event) => {
									event.stopPropagation();
									setIsEditProfileOpen(true);
								}}
							>
								<Pencil className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Edit profile</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon"
								variant="outline"
								onClick={(event) => {
									event.stopPropagation();
									onBan();
								}}
								disabled={user.id === currentUserId}
							>
								<Ban className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Ban user</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon"
								variant="outline"
								onClick={(event) => {
									event.stopPropagation();
									onDelete();
								}}
								disabled={isDeleting || user.id === currentUserId}
								aria-label="Delete user"
							>
								{isDeleting ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Trash2 className="size-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Delete user</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{isExpanded ? (
				<div
					className="mt-4 space-y-4"
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<div className="flex items-center gap-1 text-muted-foreground text-sm">
						<span>{`id: ${user.id}`}</span>
						<CopyButton
							onCopy={async () => {
								await navigator.clipboard.writeText(user.id);
								toast.success("User ID copied");
							}}
							aria-label="Copy user ID"
							variant="ghost"
							size="icon"
							className="size-7 rounded-md border-0 shadow-none hover:shadow-none"
						/>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setIsPasswordOpen(true)}
						>
							<KeyRound className="size-4" />
							Set password
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setIsImpersonateOpen(true)}
							disabled={user.id === currentUserId || role === "admin"}
						>
							<LogIn className="size-4" />
							Impersonate
						</Button>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<DetailCard label="Email" value={user.email} />
						<DetailCard label="Name" value={user.name || "No name"} />
						<DetailCard label="Created" value={formatDate(user.createdAt)} />
						<DetailCard label="Updated" value={formatDate(user.updatedAt)} />
						<DetailCard label="Role" value={role} />
						<DetailCard
							label="Image"
							value={
								typeof user.image === "string" && user.image
									? user.image
									: "No image"
							}
						/>
						{getBanReasonValue(user) ? (
							<DetailCard
								label="Ban Reason"
								value={getBanReasonValue(user) || ""}
							/>
						) : null}
						{getBanExpiresValue(user) ? (
							<DetailCard
								label="Ban Expires"
								value={getBanExpiresValue(user) || ""}
							/>
						) : null}
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<ActionCard
							title="Sessions"
							description="Inspect and revoke active sessions."
							className={user.banned ? "" : "md:col-span-2"}
						>
							<div className="space-y-3">
								<div className="flex justify-end gap-2">
									<Button
										type="button"
										size="icon"
										variant="outline"
										onClick={() => {
											void queryClient.invalidateQueries({
												queryKey: [...USER_SESSIONS_QUERY_KEY, user.id],
											});
										}}
										aria-label="Refresh sessions"
									>
										<RefreshCw className="size-4" />
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => void revokeAllSessionsMutation.mutateAsync()}
										disabled={revokeAllSessionsMutation.isPending}
									>
										{revokeAllSessionsMutation.isPending ? (
											<Loader2 className="size-4 animate-spin" />
										) : null}
										Revoke all
									</Button>
								</div>
								{sessionsQuery.isPending ? (
									<div className="flex items-center gap-2 text-muted-foreground text-sm">
										<Loader2 className="size-4 animate-spin" />
										Loading sessions...
									</div>
								) : sessionsQuery.error ? (
									<Alert variant="destructive">
										<AlertTitle>Failed to load sessions</AlertTitle>
										<AlertDescription>
											{sessionsQuery.error.message}
										</AlertDescription>
									</Alert>
								) : sessionsQuery.data?.length ? (
									<div className="space-y-2">
										{sessionsQuery.data.map((session) => (
											<SessionItem
												key={session.token}
												session={session}
												isPending={
													revokeOneSessionMutation.isPending &&
													revokeOneSessionMutation.variables === session.token
												}
												onRevoke={() =>
													void revokeOneSessionMutation.mutateAsync(
														session.token,
													)
												}
											/>
										))}
									</div>
								) : (
									<p className="text-muted-foreground text-sm">
										No sessions found.
									</p>
								)}
							</div>
						</ActionCard>

						{user.banned ? (
							<ActionCard title="Ban" description="Reverse the current ban.">
								<div className="flex justify-end">
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => void unbanMutation.mutateAsync()}
										disabled={unbanMutation.isPending}
									>
										{unbanMutation.isPending ? (
											<Loader2 className="size-4 animate-spin" />
										) : null}
										Unban user
									</Button>
								</div>
							</ActionCard>
						) : null}
					</div>
				</div>
			) : null}

			<Dialog
				open={isPasswordOpen}
				onOpenChange={(open) => {
					setIsPasswordOpen(open);
					if (!open) {
						setPasswordForm({ newPassword: "" });
					}
				}}
			>
				<DialogContent
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<DialogHeader>
						<DialogTitle>Set password</DialogTitle>
						<DialogDescription>
							Define a new password for {user.email}.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-3">
						<Input
							type="password"
							value={passwordForm.newPassword}
							onChange={(event) =>
								setPasswordForm({ newPassword: event.target.value })
							}
							placeholder="New password"
						/>
					</div>

					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsPasswordOpen(false)}
							disabled={setPasswordMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => {
								void setPasswordMutation.mutateAsync().then(() => {
									setIsPasswordOpen(false);
								});
							}}
							disabled={setPasswordMutation.isPending}
						>
							{setPasswordMutation.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : null}
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={isImpersonateOpen} onOpenChange={setIsImpersonateOpen}>
				<DialogContent
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<DialogHeader>
						<DialogTitle>Impersonate user</DialogTitle>
						<DialogDescription>
							You will switch into {user.email}'s session until you stop
							impersonating.
						</DialogDescription>
					</DialogHeader>

					<div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm">
						<p className="font-medium">
							Confirm impersonation for {user.email}.
						</p>
					</div>

					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsImpersonateOpen(false)}
							disabled={impersonateMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => {
								void impersonateMutation.mutateAsync().then(() => {
									setIsImpersonateOpen(false);
								});
							}}
							disabled={impersonateMutation.isPending}
						>
							{impersonateMutation.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<LogIn className="size-4" />
							)}
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={isEditProfileOpen}
				onOpenChange={(open) => {
					setIsEditProfileOpen(open);
				}}
			>
				<DialogContent
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<DialogHeader>
						<DialogTitle>Edit profile</DialogTitle>
						<DialogDescription>
							Update editable fields for this user.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-3">
						<Input
							value={profileForm.email}
							onChange={(event) =>
								setProfileForm((current) => ({
									...current,
									email: event.target.value,
								}))
							}
							placeholder="Email"
						/>
						<Input
							value={profileForm.name}
							onChange={(event) =>
								setProfileForm((current) => ({
									...current,
									name: event.target.value,
								}))
							}
							placeholder="Name"
						/>
						<Input
							value={profileForm.image}
							onChange={(event) =>
								setProfileForm((current) => ({
									...current,
									image: event.target.value,
								}))
							}
							placeholder="Image URL"
						/>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={profileForm.emailVerified}
								onChange={(event) =>
									setProfileForm((current) => ({
										...current,
										emailVerified: event.target.checked,
									}))
								}
							/>
							Email verified
						</label>
					</div>

					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsEditProfileOpen(false)}
							disabled={updateUserMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => {
								void updateUserMutation.mutateAsync().then(() => {
									setIsEditProfileOpen(false);
								});
							}}
							disabled={updateUserMutation.isPending}
						>
							{updateUserMutation.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : null}
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function ActionCard({
	title,
	description,
	className,
	children,
}: {
	title: string;
	description: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={`rounded-xl border border-border/60 bg-background/40 p-4 ${className ?? ""}`}
		>
			<div className="space-y-1">
				<h3 className="font-medium text-sm">{title}</h3>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<div className="mt-4">{children}</div>
		</div>
	);
}

function SessionItem({
	session,
	isPending,
	onRevoke,
}: {
	session: AdminUserSession;
	isPending: boolean;
	onRevoke: () => void;
}) {
	return (
		<div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
			<div className="min-w-0 text-sm">
				<p className="truncate">{session.userAgent || "Unknown device"}</p>
				<p className="truncate text-muted-foreground text-xs">
					Expires {formatDate(session.expiresAt)}
				</p>
				{session.impersonatedBy ? (
					<p className="truncate text-muted-foreground text-xs">
						Impersonated by {session.impersonatedBy}
					</p>
				) : null}
			</div>
			<Button
				type="button"
				size="icon"
				variant="outline"
				onClick={onRevoke}
				disabled={isPending}
				aria-label="Revoke session"
			>
				{isPending ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<X className="size-4" />
				)}
			</Button>
		</div>
	);
}
