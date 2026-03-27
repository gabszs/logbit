import * as authModels from "./authModels";
import { userSettings } from "./userSettings";

export * from "drizzle-orm";
export * from "./authModels";
export * from "./userSettings";

export const models = {
	...authModels,
	userSettings,
} as const;
