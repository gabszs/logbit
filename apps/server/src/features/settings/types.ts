export type UserSettingsRecord = {
	theme: string;
	organizationId: string | null;
};

export const DEFAULT_SETTINGS: UserSettingsRecord = {
	theme: "system",
	organizationId: null,
};
