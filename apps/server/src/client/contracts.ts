import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import { profileRouter } from "../features/profile/routes";
import { settingsRouter } from "../features/settings/routes";
import type utilityRoutes from "../features/utils/routes";

export type AppRouter = {
	profile: typeof profileRouter;
	settings: typeof settingsRouter;
};

export const appRouter: AppRouter = {
	profile: profileRouter,
	settings: settingsRouter,
} as const;

export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;
export type AppType = typeof utilityRoutes;
