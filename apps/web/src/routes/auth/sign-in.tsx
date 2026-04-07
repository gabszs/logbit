import { createFileRoute } from "@tanstack/react-router";
import { SignInShellSkeleton } from "@/web/components/skeletons/sign-in-skeleton";
import { redirectIfAuthenticated } from "@/web/lib/route-guards";
import { SignInForm } from "./-components/sign-in-form";

interface SignInSearch {
	redirect?: string;
}

const FALLBACK_REDIRECT = "/";

function sanitizeRedirect(rawRedirect: string | undefined): string {
	if (!rawRedirect || typeof rawRedirect !== "string") {
		return FALLBACK_REDIRECT;
	}

	if (!rawRedirect.startsWith("/")) {
		return FALLBACK_REDIRECT;
	}

	if (rawRedirect === "/auth/sign-in") {
		return FALLBACK_REDIRECT;
	}

	return rawRedirect;
}

export const Route = createFileRoute("/auth/sign-in")({
	validateSearch: (search: Record<string, unknown>): SignInSearch => {
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
	},
	component: SignInRoute,
	pendingComponent: SignInShellSkeleton,
});

function SignInRoute() {
	const search = Route.useSearch();

	return (
		<div className="flex min-h-svh items-start justify-center px-4 pt-[20vh]">
			<SignInForm redirectPath={search.redirect || FALLBACK_REDIRECT} />
		</div>
	);
}
