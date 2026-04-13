export interface BetterAuthErrorLike {
	message?: string;
}

export interface OrganizationListItem {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
	metadata?: unknown;
	createdAt?: Date | string;
	role?: string | null;
	memberId?: string | null;
	members?: unknown[] | null;
}

export interface OrganizationListRow extends OrganizationListItem {
	isMember: boolean;
}

export interface OrganizationDetail extends OrganizationListItem {
	members?: unknown[];
	invitations?: unknown[];
	teams?: unknown[];
}

export interface OrganizationFormValues {
	name: string;
	slug: string;
	logo: string;
	metadata: string;
}

type BetterAuthResponse<T> = Promise<{
	data: T | null;
	error: BetterAuthErrorLike | null;
}>;

export interface OrganizationAuthClient {
	useListOrganizations: () => {
		data: OrganizationListItem[] | null;
		error: BetterAuthErrorLike | null;
		isPending: boolean;
	};
	organization: {
		list: () => BetterAuthResponse<OrganizationListItem[]>;
		checkSlug: (input: {
			slug: string;
		}) => BetterAuthResponse<{ status: boolean }>;
		create: (input: {
			name: string;
			slug: string;
			logo?: string;
			metadata?: Record<string, unknown>;
			keepCurrentActiveOrganization?: boolean;
		}) => BetterAuthResponse<OrganizationListItem>;
		delete: (input: { organizationId: string }) => BetterAuthResponse<unknown>;
		getFullOrganization: (input: {
			organizationId?: string;
			organizationSlug?: string;
			membersLimit?: number;
		}) => BetterAuthResponse<OrganizationDetail>;
		setActive: (input: {
			organizationId: string | null;
		}) => BetterAuthResponse<unknown>;
		update: (input: {
			organizationId: string;
			data: {
				name: string;
				slug: string;
				logo?: string;
				metadata?: Record<string, unknown>;
			};
		}) => BetterAuthResponse<unknown>;
	};
}
