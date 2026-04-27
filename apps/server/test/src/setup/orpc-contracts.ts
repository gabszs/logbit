import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";

export type AppRouter = {
	profile: typeof import("@/features/profile/routes").profileRouter;
	settings: typeof import("@/features/settings/routes").settingsRouter;
};

export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;
