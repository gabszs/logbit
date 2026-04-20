import { createSelectSchema } from "drizzle-zod";
import type z from "zod";
import { models } from "@/db/models";

export const userSettingsSchema = createSelectSchema(models.userSettings);

export type UserSettingsType = z.infer<typeof userSettingsSchema>;
