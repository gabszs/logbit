export interface AuthRedirectSearch {
	redirect?: string;
}

export const FALLBACK_REDIRECT = "/";

export function sanitizeRedirect(rawRedirect: string | undefined): string {
	if (!rawRedirect || typeof rawRedirect !== "string") {
		return FALLBACK_REDIRECT;
	}

	if (!rawRedirect.startsWith("/")) {
		return FALLBACK_REDIRECT;
	}

	if (rawRedirect === "/auth" || rawRedirect.startsWith("/auth/")) {
		return FALLBACK_REDIRECT;
	}

	return rawRedirect;
}
