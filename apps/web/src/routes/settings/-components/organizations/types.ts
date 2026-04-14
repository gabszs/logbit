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
