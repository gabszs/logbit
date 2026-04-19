import { createSelectSchema } from "drizzle-zod";
import type z from "zod";
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

export const userSettingsSchema = createSelectSchema(models.userSettings)
	.openapi("UserSettings schema");
export const integrationsSchema = createSelectSchema(models.integrations)
	.openapi("Integrations schema");

export type PgUserSettingsType = typeof userSettings;
export type PgIntegrationsType = typeof integrations;
export type UserSettingsType = z.infer<typeof userSettingsSchema>;
export type IntegrationsType = z.infer<typeof integrationsSchema>;
