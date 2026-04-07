import { redirect } from "@tanstack/react-router";
import type { authClient } from "@/web/lib/auth-client";

interface RedirectIfAuthenticatedOptions {
	authClient: typeof authClient;
	to: string;
}

export async function redirectIfAuthenticated({
	authClient,
	to,
}: RedirectIfAuthenticatedOptions) {
	const { data: session, error } = await authClient.getSession();
	if (error) {
		console.error("Failed to fetch auth session", error);
	}

	if (session) {
		throw redirect({
			to,
			replace: true,
		});
	}
}

interface RequireAuthenticatedOptions {
	authClient: typeof authClient;
	location: { href?: string | null; pathname?: string | null };
}

export async function requireAuthenticated({
	authClient,
	location,
}: RequireAuthenticatedOptions) {
	const { data: session, error } = await authClient.getSession();
	if (error) {
		console.error("Failed to fetch auth session", error);
	}

	if (!session) {
		const redirectTarget = location.href ?? location.pathname ?? "/";

		throw redirect({
			to: "/auth/sign-in",
			replace: true,
			search: {
				redirect: redirectTarget,
			},
		});
	}
}
