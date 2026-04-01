import { eq } from "drizzle-orm";
import type { Context } from "@/lib/orpc";
import { userSettings } from "../../db/models/userSettings";
import { getUserSettings } from "./queries";
import { DEFAULT_SETTINGS } from "./types";

export async function ensureSettingsRow(
	db: Context["db"],
	userId: string,
): Promise<void> {
	const now = new Date();
	await db
		.insert(userSettings)
		.values({
			userId,
			theme: DEFAULT_SETTINGS.theme,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: userSettings.userId });
}

export async function updateUserSettings(
	db: Context["db"],
	userId: string,
	updates: { theme?: string },
) {
	await ensureSettingsRow(db, userId);

	if (updates.theme !== undefined) {
		await db
			.update(userSettings)
			.set({
				theme: updates.theme,
				updatedAt: new Date(),
			})
			.where(eq(userSettings.userId, userId));
	}

	return getUserSettings(db, userId);
}
