import { createFileRoute, redirect } from "@tanstack/react-router";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { SignInShellSkeleton } from "@/web/components/skeletons/sign-in-skeleton";
import { getSetupStatus } from "@/web/lib/hono-rpc";
import { redirectIfAuthenticated } from "@/web/lib/route-guards";
import { signInEmailSchema } from "@/web/lib/validators";
import { TwoFactorForm } from "./-components/two-factor-form";
import { FALLBACK_REDIRECT, sanitizeRedirect } from "./-utils/redirect";

interface TwoFactorSearch {
	redirect?: string;
	username?: string;
}

const sanitizeUsername = (rawUsername: unknown): string | undefined => {
	if (typeof rawUsername !== "string") return undefined;
	const parsed = signInEmailSchema.safeParse({ email: rawUsername.trim() });
	if (!parsed.success) return undefined;
	return parsed.data.email;
};

export const Route = createFileRoute("/auth/two-factor")({
	validateSearch: (search: Record<string, unknown>): TwoFactorSearch => {
		const redirectValue = sanitizeRedirect(
			search.redirect as string | undefined,
		);
		const username = sanitizeUsername(search.username);

		return {
			...(redirectValue !== FALLBACK_REDIRECT
				? { redirect: redirectValue }
				: {}),
			...(username ? { username } : {}),
		};
	},
	beforeLoad: async (opts) => {
		await redirectIfAuthenticated({
			authClient: opts.context.authClient,
			to: opts.search.redirect || FALLBACK_REDIRECT,
		});

		const setup = await getSetupStatus();
		if (!setup.hasUsers) {
			throw redirect({
				to: "/auth/sign-up",
				replace: true,
				search:
					opts.search.redirect && opts.search.redirect !== FALLBACK_REDIRECT
						? { redirect: opts.search.redirect }
						: undefined,
			});
		}
	},
	component: TwoFactorRoute,
	pendingComponent: SignInShellSkeleton,
	errorComponent: ErrorBoundary,
});

function TwoFactorRoute() {
	const search = Route.useSearch();

	return (
		<div className="flex min-h-svh items-start justify-center px-4 pt-[20vh]">
			<TwoFactorForm
				redirectPath={search.redirect || FALLBACK_REDIRECT}
				username={search.username}
			/>
		</div>
	);
}
