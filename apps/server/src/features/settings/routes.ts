import { protectedProcedure } from "@/lib/orpc";
import { getUserSettings, updateUserSettings } from "./queries";
import { userSettingsSchema } from "./schemas";

const updateSettingsSchema = userSettingsSchema.pick({
	theme: true,
	organizationId: true,
}).partial();

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
