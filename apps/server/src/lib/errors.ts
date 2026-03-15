import { HTTPException } from "hono/http-exception";
import { type ContentfulStatusCode } from "hono/utils/http-status";
import { HttpStatusCodes, HttpStatusPhrases } from "./constants";

type ErrorOptions = Partial<{
	success: boolean;
	code: string;
	message: string;
	status: string;
}>;

function createHttpException(
	defaultCode: string,
	defaultMessage: string,
	defaultStatus: ContentfulStatusCode,
	opts: ErrorOptions = {},
) {
	const errorResponse = new Response(
		JSON.stringify({
			code: opts.code || defaultCode,
			message: opts.message || defaultMessage,
			status: defaultStatus,
		}),
		{
			status: defaultStatus,
			headers: {
				"Content-Type": "application/json",
			},
		},
	);
	return new HTTPException(defaultStatus, { res: errorResponse });
}

export const httpErrors = {
	invalidAuthorizationHeader: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.UNAUTHORIZED,
			"The 'Authorization' header must be provided in the format: 'Bearer <token>'",
			HttpStatusCodes.UNAUTHORIZED,
			opts,
		),
	duplicateField: (entity: string, field: string, opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.CONFLICT,
			`A ${entity} with this ${field} already exists.`,
			HttpStatusCodes.CONFLICT,
			opts,
		),

	noChangesDetected: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.UNPROCESSABLE_ENTITY,
			"No changes were detected in the webhook payload",
			HttpStatusCodes.UNPROCESSABLE_ENTITY,
			opts,
		),
	expressionEvaluationFailed: (engine: string, errMsg: string, opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.BAD_REQUEST,
			`Failed to evaluate expression with engine "${engine}": "${errMsg}"`,
			HttpStatusCodes.BAD_REQUEST,
			opts,
		),
	missingRedirectUrl: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.BAD_REQUEST,
			"The 'redirect_url' query parameter is required",
			HttpStatusCodes.BAD_REQUEST,
			opts,
		),

	userMismatch: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.FORBIDDEN,
			"The userId does not match the provided entity id",
			HttpStatusCodes.FORBIDDEN,
			opts,
		),

	entityInactive: (entityName: string, opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.FORBIDDEN,
			`The requested ${entityName} is inactive`,
			HttpStatusCodes.FORBIDDEN,
			opts,
		),

	missingRequiredField: (fieldName: string, opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.BAD_REQUEST,
			`The '${fieldName}' field is required`,
			HttpStatusCodes.BAD_REQUEST,
			opts,
		),

	missingApiKey: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.BAD_REQUEST,
			"The 'api_key' query parameter is required",
			HttpStatusCodes.BAD_REQUEST,
			opts,
		),

	apiKeyNotFound: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.UNAUTHORIZED,
			"The provided API key was not found",
			HttpStatusCodes.UNAUTHORIZED,
			opts,
		),

	apiKeyInactive: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.FORBIDDEN,
			"The provided API key is not active or has been disabled",
			HttpStatusCodes.FORBIDDEN,
			opts,
		),

	badRequest: (message: string, opts?: ErrorOptions) =>
		createHttpException(HttpStatusPhrases.BAD_REQUEST, message, HttpStatusCodes.BAD_REQUEST, opts),

	unauthorized: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.UNAUTHORIZED,
			"You must be authenticated to access this resource",
			HttpStatusCodes.UNAUTHORIZED,
			opts,
		),

	forbidden: (opts?: ErrorOptions) =>
		createHttpException(
			HttpStatusPhrases.FORBIDDEN,
			"You do not have permission to access this resource",
			HttpStatusCodes.FORBIDDEN,
			opts,
		),

	custom: (opts: ErrorOptions & { status: number }) =>
		createHttpException(
			HttpStatusPhrases.BAD_REQUEST,
			opts.message || "An error occurred",
			opts.status,
			opts,
		),
};
