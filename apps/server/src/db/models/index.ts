import * as authModels from "./authModels";
import { integrations } from "./integrations";
import { sources } from "./sources";
import { userSettings } from "./userSettings";

export * from "drizzle-orm";
export * from "./authModels";
export * from "./integrations";
export * from "./sources";
export * from "./userSettings";

export const models = {
	...authModels,
	userSettings,
	integrations,
	sources,
} as const;

export type PgUserSettingsType = typeof userSettings;
export type PgIntegrationsType = typeof integrations;
export type PgSourcesType = typeof sources;
