import type { authClient } from "@/web/lib/auth-client";

export type AdminListUsersData = NonNullable<
	Awaited<ReturnType<typeof authClient.admin.listUsers>>["data"]
>;

export type AdminUserListItem = AdminListUsersData["users"][number];

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

export type AdminPasswordForm = {
	newPassword: string;
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
	isPermanent: boolean;
};

export const ADMIN_ROLE_OPTIONS = ["user", "admin"] as const;

export type AdminRole = (typeof ADMIN_ROLE_OPTIONS)[number];
