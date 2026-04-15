import type { authClient } from "@/web/lib/auth-client";

export type AdminListUsersData = NonNullable<
	Awaited<ReturnType<typeof authClient.admin.listUsers>>["data"]
>;

export type AdminUserListItem = AdminListUsersData["users"][number];

export type AdminUserDetail = NonNullable<
	Awaited<ReturnType<typeof authClient.admin.getUser>>["data"]
>;

export type AdminUserSessionsData = NonNullable<
	Awaited<ReturnType<typeof authClient.admin.listUserSessions>>["data"]
>;

export type AdminUserSession = AdminUserSessionsData["sessions"][number];

export type AdminEditableUserForm = {
	email: string;
	name: string;
	image: string;
	emailVerified: boolean;
};

export type AdminCreateUserForm = {
	email: string;
	name: string;
	password: string;
	role: AdminRole;
};

export type AdminBanForm = {
	banReason: string;
	banExpiresInHours: string;
};

export const ADMIN_ROLE_OPTIONS = ["user", "admin"] as const;

export type AdminRole = (typeof ADMIN_ROLE_OPTIONS)[number];

export const ADMIN_PERMISSION_OPTIONS = {
	user: [
		"create",
		"list",
		"set-role",
		"ban",
		"impersonate",
		"delete",
		"set-password",
		"get",
		"update",
	],
	session: ["list", "revoke", "delete"],
} as const;

export type AdminPermissionResource = keyof typeof ADMIN_PERMISSION_OPTIONS;

export type AdminPermissionValue =
	| (typeof ADMIN_PERMISSION_OPTIONS.user)[number]
	| (typeof ADMIN_PERMISSION_OPTIONS.session)[number];

export type AdminPermissionAction = {
	resource: AdminPermissionResource;
	action: AdminPermissionValue;
};
