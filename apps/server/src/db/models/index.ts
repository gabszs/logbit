import * as authModels from "./authModels";
import { connections } from "./connections";
import { sources } from "./sources";
import { userSettings } from "./userSettings";

export * from "drizzle-orm";
export * from "./authModels";
export * from "./connections";
export * from "./sources";
export * from "./userSettings";

export const models = {
	...authModels,
	userSettings,
	connections,
	sources,
} as const;

export type PgUserSettingsType = typeof userSettings;
export type PgConnectionsType = typeof connections;
export type PgSourcesType = typeof sources;
