import type { UserSettingsType } from "@/db/models";

export type UserSettingsRecord = Pick<
	UserSettingsType,
	"theme" | "organizationId"
>;
export const DEFAULT_SETTINGS: UserSettingsRecord = {
	theme: "system",
	organizationId: null,
};
