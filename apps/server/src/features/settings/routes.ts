import { protectedProcedure } from "@/lib/orpc";
import { getUserSettings, updateUserSettings } from "./queries";
import { userSettingsSchema } from "./schemas";

const updateSettingsSchema = userSettingsSchema
	.pick({
		theme: true,
		organizationId: true,
		sourceId: true,
		connectionId: true,
	})
	.partial();

const getSettings = protectedProcedure.handler(async ({ context }) => {
	return await getUserSettings(context.db, context.session.user.id);
});

const updateSettings = protectedProcedure
	.input(updateSettingsSchema)
	.handler(async ({ context, input }) => {
		return await updateUserSettings(context.db, context.session.user.id, input);
	});

type SettingsRouter = {
	get: typeof getSettings;
	update: typeof updateSettings;
};

export const settingsRouter: SettingsRouter = {
	get: getSettings,
	update: updateSettings,
};
