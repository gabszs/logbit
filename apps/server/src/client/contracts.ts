import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import { profileRouter } from "../features/profile/routes";
import { settingsRouter } from "../features/settings/routes";
import type utilityRoutes from "../features/utils/routes";

export const appRouter = {
	profile: profileRouter,
	settings: settingsRouter,
} as const;

export type AppRouter = typeof appRouter;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;
export type AppType = typeof utilityRoutes;
