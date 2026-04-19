import { ORPCError } from "@orpc/server";
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
		throw new ORPCError("NOT_FOUND", { message: "Settings not found" });
	}

	return {
		theme: row.theme ?? DEFAULT_SETTINGS.theme,
		organizationId: row.organizationId ?? DEFAULT_SETTINGS.organizationId,
	};
}

export async function insertSettingsRow(
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
	updates: { theme?: string; organizationId?: string | null },
) {
	await insertSettingsRow(db, userId);

	const set: Partial<typeof userSettings.$inferInsert> = {
		updatedAt: new Date(),
	};

	if (updates.theme !== undefined) {
		set.theme = updates.theme;
	}

	if (updates.organizationId !== undefined) {
		set.organizationId = updates.organizationId;
	}

	if (Object.keys(set).length > 1) {
		await db
			.update(userSettings)
			.set(set)
			.where(eq(userSettings.userId, userId));
	}

	return getUserSettings(db, userId);
}
