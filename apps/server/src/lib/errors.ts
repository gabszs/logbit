import type { ProblemDetailsInput } from "hono-problem-details";
import { problemDetails } from "hono-problem-details";
import { status } from "./constants";

type HttpErrorDefaults = {
	status: number;
	title: string;
	detail: string;
};

export type ErrorOptions = {
	status?: number;
	title?: string;
	detail?: string;
	type?: string;
	instance?: string;
	extensions?: ProblemDetailsInput["extensions"];
};

const createHttpError = (
	defaults: HttpErrorDefaults,
	options: ErrorOptions = {},
) => {
	const payload: ProblemDetailsInput = {
		type: options.type ?? "about:blank",
		status: options.status ?? defaults.status,
		title: options.title ?? defaults.title,
		detail: options.detail ?? defaults.detail,
		...(options.instance !== undefined && { instance: options.instance }),
		...(options.extensions !== undefined && { extensions: options.extensions }),
	};

	return problemDetails(payload);
};

const createStatusError = (
	statusEntry: { code: number; title: string; detail: string },
	defaultDetail: string = statusEntry.detail,
	options: ErrorOptions = {},
) =>
	createHttpError(
		{
			status: statusEntry.code,
			title: statusEntry.title,
			detail: defaultDetail,
		},
		options,
	);

const resolveBadRequestArgs = (
	arg1?: string | ErrorOptions,
	arg2?: ErrorOptions,
): { defaultDetail: string; options: ErrorOptions } => {
	if (typeof arg1 === "string") {
		return {
			defaultDetail: arg1,
			options: arg2 ?? {},
		};
	}

	return {
		defaultDetail: status.BAD_REQUEST.detail,
		options: arg1 ?? {},
	};
};

export const error = {
	tooManyRequests: (options: ErrorOptions = {}) =>
		createStatusError(status.TOO_MANY_REQUESTS, undefined, options),

	invalidAuthorizationHeader: (options: ErrorOptions = {}) =>
		createStatusError(
			status.UNAUTHORIZED,
			"The 'Authorization' header must be provided in the format: 'Bearer <token>'",
			options,
		),

	duplicateField: (entity: string, field: string, options: ErrorOptions = {}) =>
		createStatusError(
			status.CONFLICT,
			`A ${entity} with this ${field} already exists.`,
			options,
		),

	noChangesDetected: (options: ErrorOptions = {}) =>
		createStatusError(
			status.UNPROCESSABLE_ENTITY,
			"No changes were detected in the webhook payload",
			options,
		),

	expressionEvaluationFailed: (
		engine: string,
		errMsg: string,
		options: ErrorOptions = {},
	) =>
		createStatusError(
			status.BAD_REQUEST,
			`Failed to evaluate expression with engine "${engine}": "${errMsg}"`,
			options,
		),

	missingRedirectUrl: (options: ErrorOptions = {}) =>
		createStatusError(
			status.BAD_REQUEST,
			"The 'redirect_url' query parameter is required",
			options,
		),

	userMismatch: (options: ErrorOptions = {}) =>
		createStatusError(
			status.FORBIDDEN,
			"The userId does not match the provided entity id",
			options,
		),

	entityInactive: (entityName: string, options: ErrorOptions = {}) =>
		createStatusError(
			status.FORBIDDEN,
			`The requested ${entityName} is inactive`,
			options,
		),

	missingRequiredField: (fieldName: string, options: ErrorOptions = {}) =>
		createStatusError(
			status.BAD_REQUEST,
			`The '${fieldName}' field is required`,
			options,
		),

	missingApiKey: (options: ErrorOptions = {}) =>
		createStatusError(
			status.BAD_REQUEST,
			"The 'api_key' query parameter is required",
			options,
		),

	apiKeyNotFound: (options: ErrorOptions = {}) =>
		createStatusError(
			status.UNAUTHORIZED,
			"The provided API key was not found",
			options,
		),

	apiKeyInactive: (options: ErrorOptions = {}) =>
		createStatusError(
			status.FORBIDDEN,
			"The provided API key is not active or has been disabled",
			options,
		),

	unsupportedMediaType: (options: ErrorOptions = {}) =>
		createStatusError(
			status.UNSUPPORTED_MEDIA_TYPE,
			"The request's Content-Type is not supported.",
			options,
		),

	badRequest: (arg1?: string | ErrorOptions, arg2?: ErrorOptions) => {
		const { defaultDetail, options } = resolveBadRequestArgs(arg1, arg2);
		return createStatusError(status.BAD_REQUEST, defaultDetail, options);
	},

	unauthorized: (options: ErrorOptions = {}) =>
		createStatusError(
			status.UNAUTHORIZED,
			"You must be authenticated to access this resource",
			options,
		),

	forbidden: (options: ErrorOptions = {}) =>
		createStatusError(
			status.FORBIDDEN,
			"You do not have permission to access this resource",
			options,
		),

	custom: (
		statusCode: number,
		defaultDetail: string = status.BAD_REQUEST.detail,
		options: ErrorOptions = {},
	) =>
		createHttpError(
			{
				status: statusCode,
				title: status.BAD_REQUEST.title,
				detail: defaultDetail,
			},
			options,
		),
};

export const httpErrors = error;
