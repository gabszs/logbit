import type { UserSettingsType } from "./schemas";

export type UserSettingsRecord = Pick<
	UserSettingsType,
	"theme" | "organizationId" | "sourceId" | "integrationId"
>;
export const DEFAULT_SETTINGS: UserSettingsRecord = {
	theme: "system",
	organizationId: null,
	sourceId: null,
	integrationId: null,
};
