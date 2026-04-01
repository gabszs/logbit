import { eq } from "drizzle-orm";
import type { Context } from "@/lib/orpc";
import { userSettings } from "../../db/models/userSettings";
import { DEFAULT_SETTINGS } from "./types";

export async function getUserSettings(db: Context["db"], userId: string) {
	const [row] = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, userId))
		.limit(1);

	if (!row) {
		return { ...DEFAULT_SETTINGS };
	}

	return {
		theme: row.theme ?? DEFAULT_SETTINGS.theme,
	};
}
