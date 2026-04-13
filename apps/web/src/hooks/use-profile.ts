import { useQuery } from "@tanstack/react-query";
import { useAuthenticatedQueryEnabled } from "@/web/hooks/use-authenticated-query-enabled";
import { orpc } from "@/web/lib/orpc";

/**
 * Shared hook for accessing user profile data across the application.
 *
 * Caching Strategy:
 * - 5 minute staleTime (matches server cookie cache duration)
 * - No automatic refetching (refetchOnMount, refetchOnWindowFocus disabled)
 * - Manual invalidation on profile mutations only
 *
 * This prevents duplicate network calls and reduces server load while
 * keeping data fresh when it actually changes.
 */
export function useProfile() {
	const isAuthenticated = useAuthenticatedQueryEnabled();

	return useQuery(
		orpc.profile.get.queryOptions({
			enabled: isAuthenticated,
			staleTime: 5 * 60 * 1000, // 5 minutes
			refetchOnMount: false,
			refetchOnWindowFocus: false,
		}),
	);
}
