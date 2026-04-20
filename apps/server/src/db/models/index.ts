import * as authModels from "./authModels";
import { integrations } from "./integrations";
import { userSettings } from "./userSettings";

export * from "drizzle-orm";
export * from "./authModels";
export * from "./integrations";
export * from "./userSettings";

export const models = {
	...authModels,
	userSettings,
	integrations,
} as const;

export type PgUserSettingsType = typeof userSettings;
export type PgIntegrationsType = typeof integrations;
