import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/web/components/auth-provider";
import { useAuthenticatedQueryEnabled } from "@/web/hooks/use-authenticated-query-enabled";
import { orpc } from "@/web/lib/orpc";
import type { RouterOutputs } from "@/server/index";

export type UserSettings = RouterOutputs["settings"]["get"];

export function useUserSettings() {
	const isAuthenticated = useAuthenticatedQueryEnabled();

	return useQuery(
		orpc.settings.get.queryOptions({
			enabled: isAuthenticated,
			staleTime: 5 * 60 * 1000,
			refetchOnMount: false,
			refetchOnWindowFocus: false,
			retry: false,
		}),
	);
}

export function useUpdateUserSettings() {
	const queryClient = useQueryClient();
	const auth = useAuth();
	const userId = auth.session?.user?.id;

	const mutation = useMutation(
		orpc.settings.update.mutationOptions({
			onMutate: async (updates: Partial<UserSettings>) => {
				await queryClient.cancelQueries({
					queryKey: orpc.settings.get.queryKey({}),
				});

				const previous = queryClient.getQueryData<UserSettings>(
					orpc.settings.get.queryKey({}),
				);

				if (previous) {
					queryClient.setQueryData(orpc.settings.get.queryKey({}), {
						...previous,
						...updates,
					});
				}

				return { previous };
			},
			onSuccess: (updated: UserSettings) => {
				queryClient.setQueryData(orpc.settings.get.queryKey({}), updated);
			},
			onError: (
				_error: Error,
				_variables: Partial<UserSettings>,
				context: { previous?: UserSettings } | undefined,
			) => {
				if (context?.previous) {
					queryClient.setQueryData(
						orpc.settings.get.queryKey({}),
						context.previous,
					);
				}
			},
		}),
	);

	return useCallback(
		async (updates: Partial<UserSettings>) => {
			if (!userId) {
				throw new Error("User not authenticated");
			}
			return await mutation.mutateAsync(updates);
		},
		[mutation, userId],
	);
}
