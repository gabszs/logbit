import { z } from "zod";
import { protectedProcedure } from "@/lib/orpc";
import { ensureSettingsRow, updateUserSettings } from "./mutations";
import { getUserSettings } from "./queries";

const updateSettingsSchema = z.object({
	theme: z.string().optional(),
});

export const settingsRouter = {
	get: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		await ensureSettingsRow(context.db, userId);
		return await getUserSettings(context.db, userId);
	}),

	update: protectedProcedure
		.input(updateSettingsSchema)
		.handler(async ({ context, input }) => {
			return await updateUserSettings(
				context.db,
				context.session.user.id,
				input,
			);
		}),
} as const;
