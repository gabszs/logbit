import * as authModels from "./authModels";
import { documents } from "./documents";

export * from "drizzle-orm";
export * from "./authModels";
export { documents } from "./documents";

export const models = {
	...authModels,
	documents,
} as const;
