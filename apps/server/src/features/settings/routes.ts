import { z } from "zod";
import { protectedProcedure } from "@/lib/orpc";
import { getUserSettings, updateUserSettings } from "./queries";

const updateSettingsSchema = z.object({
	theme: z.string().optional(),
	organizationId: z.string().uuid().nullable().optional(),
});

export const settingsRouter = {
	get: protectedProcedure.handler(async ({ context }) => {
		return await getUserSettings(context.db, context.session.user.id);
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
