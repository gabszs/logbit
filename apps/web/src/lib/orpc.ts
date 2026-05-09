import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { QueryClient as TanStackQueryClient } from "@tanstack/react-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AppRouter } from "@/index";
import { isBackendUnavailableError } from "@/web/lib/backend-error";
import { settings } from "@/web/lib/config";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			if (isBackendUnavailableError(error)) {
				toast.error("Server is not responding", {
					action: {
						label: "reload",
						onClick: () => {
							window.location.reload();
						},
					},
				});
				return;
			}

			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: () => {
						queryClient.invalidateQueries();
					},
				},
			});
		},
	}),
});

const link = new RPCLink({
	url: `${settings.serverUrl}/orpc`,
	fetch(request, init) {
		return fetch(
			new Request(request, {
				...init,
				credentials: "include",
			}),
		);
	},
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export type AppRouterClient = RouterClient<AppRouter>;

export const orpcClient: AppRouterClient =
	createORPCClient<AppRouterClient>(link);

export const orpc = createTanstackQueryUtils(orpcClient);

export async function clearAuthenticatedQueries(
	targetQueryClient: TanStackQueryClient,
) {
	const protectedQueryKeys = [
		orpc.profile.get.queryOptions().queryKey,
		orpc.profile.listSessions.queryOptions().queryKey,
		orpc.settings.get.queryOptions().queryKey,
	];

	for (const queryKey of protectedQueryKeys) {
		await targetQueryClient.cancelQueries({ queryKey });
		targetQueryClient.removeQueries({ queryKey });
	}
}
