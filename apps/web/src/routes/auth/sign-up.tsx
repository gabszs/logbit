import { createFileRoute, redirect } from "@tanstack/react-router";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { SignInShellSkeleton } from "@/web/components/skeletons/sign-in-skeleton";
import { getSetupStatus } from "@/web/lib/hono-rpc";
import { redirectIfAuthenticated } from "@/web/lib/route-guards";
import { SignUpForm } from "./-components/sign-up-form";
import {
	type AuthRedirectSearch,
	FALLBACK_REDIRECT,
	sanitizeRedirect,
} from "./-utils/redirect";

export const Route = createFileRoute("/auth/sign-up")({
	validateSearch: (search: Record<string, unknown>): AuthRedirectSearch => {
		const redirectValue = sanitizeRedirect(
			search.redirect as string | undefined,
		);
		if (redirectValue === FALLBACK_REDIRECT) {
			return {};
		}
		return {
			redirect: redirectValue,
		};
	},
	beforeLoad: async (opts) => {
		await redirectIfAuthenticated({
			authClient: opts.context.authClient,
			to: opts.search.redirect || FALLBACK_REDIRECT,
		});

		const setup = await getSetupStatus();
		if (setup.hasUsers) {
			throw redirect({
				to: "/auth/sign-in",
				replace: true,
				search:
					opts.search.redirect && opts.search.redirect !== FALLBACK_REDIRECT
						? { redirect: opts.search.redirect }
						: undefined,
			});
		}
	},
	component: SignUpRoute,
	pendingComponent: SignInShellSkeleton,
	errorComponent: ErrorBoundary,
});

function SignUpRoute() {
	const search = Route.useSearch();

	return (
		<div className="flex min-h-svh items-start justify-center px-4 pt-[20vh]">
			<SignUpForm redirectPath={search.redirect || FALLBACK_REDIRECT} />
		</div>
	);
}
