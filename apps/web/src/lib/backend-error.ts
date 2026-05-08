const backendUnavailableMessages = [
	"failed to fetch",
	"fetch failed",
	"networkerror",
	"network request failed",
	"load failed",
	"connection refused",
	"econnrefused",
	"err_connection_refused",
	"err_network",
	"err_failed",
	"request failed with status 0",
];

export function getErrorDisplayMessage(error: unknown) {
	const message = getErrorMessage(error);
	if (message) {
		return message;
	}

	if (typeof error === "string") {
		return error;
	}

	return "Unknown error";
}

export function isBackendUnavailableError(error: unknown): boolean {
	return isBackendUnavailableErrorAtDepth(error, 0);
}

function isBackendUnavailableErrorAtDepth(
	error: unknown,
	depth: number,
): boolean {
	if (depth > 4) {
		return false;
	}

	const message = getErrorMessage(error)?.toLowerCase();
	if (
		message &&
		backendUnavailableMessages.some((pattern) => message.includes(pattern))
	) {
		return true;
	}

	const cause = getErrorCause(error);
	if (cause && cause !== error) {
		return isBackendUnavailableErrorAtDepth(cause, depth + 1);
	}

	return false;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "object" && error !== null && "message" in error) {
		const { message } = error;
		if (typeof message === "string") {
			return message;
		}
	}

	return null;
}

function getErrorCause(error: unknown): unknown {
	if (error instanceof Error) {
		return error.cause;
	}

	if (typeof error === "object" && error !== null && "cause" in error) {
		return error.cause;
	}

	return null;
}
