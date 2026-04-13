import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/web/components/auth-provider";

export function useAuthenticatedQueryEnabled() {
	const auth = useAuth();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return Boolean(auth.session?.user?.id) && !pathname.startsWith("/auth/");
}
