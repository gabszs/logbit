export interface OrganizationListItem {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
	metadata?: unknown;
	createdAt?: Date | string;
	role?: string | null;
	memberId?: string | null;
	members?: OrganizationMemberSummary[] | null;
}

export interface OrganizationMemberSummary {
	id?: string;
	userId?: string;
	role?: string | null;
	createdAt?: Date | string;
	user?: {
		id?: string;
		name?: string | null;
		email?: string | null;
	};
}

export interface OrganizationListRow extends OrganizationListItem {
	hasExplicitMembership: boolean;
}

export interface OrganizationDetail extends OrganizationListItem {
	members?: OrganizationMemberSummary[];
	invitations?: unknown[];
	teams?: unknown[];
}

export interface OrganizationFormValues {
	name: string;
	slug: string;
	logo: string;
	metadata: string;
}
