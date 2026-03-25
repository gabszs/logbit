import { PROBLEM_JSON_CONTENT_TYPE } from "hono-problem-details";
import { z } from "zod";

export const EMAIL_FROM_NAME = "IMOB support";
export const EMAIL_FROM_ADDRESS = "noreply@imob.io";

export const GITHUB_REPO_URL = "https://github.com/imob";
export const MAIN_SITE_URL = "https://imob.io";

export const ContentTypes: Record<string, string> = {
	JSON: "application/json",
	PROBLEM_JSON: PROBLEM_JSON_CONTENT_TYPE,
	FORM_URLENCODED: "application/x-www-form-urlencoded",
	FORM_DATA: "multipart/form-data",
	TEXT: "text/plain",
	HTML: "text/html",
	XML: "application/xml",
	CSV: "text/csv",
	PDF: "application/pdf",
	OCTET_STREAM: "application/octet-stream",
} as const;

type HttpStatusDefaults = {
	code: number;
	title: string;
	detail: string;
};

export type HttpErrorResponseOptions = {
	type?: string;
	status?: number;
	title?: string;
	detail?: string;
	instance?: string;
	description?: string;
	schemaDescription?: string;
};

export const createHttpResponse = <TSchema>(
	schema: TSchema,
	description: string,
	contentType: string = ContentTypes.JSON,
) =>
	({
		description,
		content: {
			[contentType]: {
				schema,
			},
		},
	}) as const;

export const createErrorHttpResponse = (
	defaults: HttpStatusDefaults,
	options: HttpErrorResponseOptions = {},
) => {
	const type = options.type ?? "about:blank";
	const statusCode = options.status ?? defaults.code;
	const title = options.title ?? defaults.title;
	const detail = options.detail ?? defaults.detail;
	const description = options.description ?? detail;
	const schemaDescription = options.schemaDescription ?? `${title} response`;
	const schemaShape: {
		type: z.ZodString;
		status: z.ZodNumber;
		title: z.ZodString;
		detail: z.ZodString;
		instance?: z.ZodString;
	} = {
		type: z.string().openapi({
			description: "Problem type URI",
			example: type,
		}),
		status: z.number().openapi({
			description: "HTTP status code",
			example: statusCode,
		}),
		title: z.string().openapi({
			description: "RFC Status phrase",
			example: title,
		}),
		detail: z.string().openapi({
			description: "Detailed error message",
			example: detail,
		}),
	};

	if (options.instance !== undefined) {
		schemaShape.instance = z.string().openapi({
			description: "Error instance URI",
			example: options.instance,
		});
	}

	return {
		description,
		content: {
			[ContentTypes.PROBLEM_JSON]: {
				schema: z.object(schemaShape).openapi({
					description: schemaDescription,
				}),
			},
		},
	} as const;
};

export const status = {
	CONTINUE: {
		code: 100,
		title: "Continue",
		detail: "Continue.",
	},
	SWITCHING_PROTOCOLS: {
		code: 101,
		title: "Switching Protocols",
		detail: "Switching Protocols.",
	},
	PROCESSING: {
		code: 102,
		title: "Processing",
		detail: "Processing.",
	},
	EARLY_HINTS: {
		code: 103,
		title: "Early Hints",
		detail: "Early Hints.",
	},
	OK: {
		code: 200,
		title: "OK",
		detail: "Request completed successfully.",
		response: <TSchema>(
			schema: TSchema,
			description = "Request completed successfully.",
		) => createHttpResponse(schema, description),
	},
	CREATED: {
		code: 201,
		title: "Created",
		detail: "Resource created successfully.",
	},
	ACCEPTED: {
		code: 202,
		title: "Accepted",
		detail: "Request accepted and being processed.",
	},
	NON_AUTHORITATIVE_INFORMATION: {
		code: 203,
		title: "Non Authoritative Information",
		detail: "Non Authoritative Information.",
	},
	NO_CONTENT: {
		code: 204,
		title: "No Content",
		detail: "Request completed. No content to return.",
		response: (description = "Request completed. No content to return.") => ({
			description,
		}),
	},
	RESET_CONTENT: {
		code: 205,
		title: "Reset Content",
		detail: "Reset Content.",
	},
	PARTIAL_CONTENT: {
		code: 206,
		title: "Partial Content",
		detail: "Partial Content.",
	},
	MULTI_STATUS: {
		code: 207,
		title: "Multi-Status",
		detail: "Multi-Status.",
	},
	ALREADY_REPORTED: {
		code: 208,
		title: "Already Reported",
		detail: "Already Reported.",
	},
	IM_USED: {
		code: 226,
		title: "IM Used",
		detail: "IM Used.",
	},
	MULTIPLE_CHOICES: {
		code: 300,
		title: "Multiple Choices",
		detail: "Multiple Choices.",
	},
	MOVED_PERMANENTLY: {
		code: 301,
		title: "Moved Permanently",
		detail: "Moved Permanently.",
	},
	FOUND: {
		code: 302,
		title: "Found",
		detail: "Found.",
	},
	MOVED_TEMPORARILY: {
		code: 302,
		title: "Moved Temporarily",
		detail: "Moved Temporarily.",
	},
	SEE_OTHER: {
		code: 303,
		title: "See Other",
		detail: "See Other.",
	},
	NOT_MODIFIED: {
		code: 304,
		title: "Not Modified",
		detail: "Not Modified.",
	},
	USE_PROXY: {
		code: 305,
		title: "Use Proxy",
		detail: "Use Proxy.",
	},
	RESERVED: {
		code: 306,
		title: "Reserved",
		detail: "Reserved.",
	},
	TEMPORARY_REDIRECT: {
		code: 307,
		title: "Temporary Redirect",
		detail: "Temporary Redirect.",
	},
	PERMANENT_REDIRECT: {
		code: 308,
		title: "Permanent Redirect",
		detail: "Permanent Redirect.",
	},
	BAD_REQUEST: {
		code: 400,
		title: "Bad Request",
		detail: "Invalid request. Check the parameters sent.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 400,
					title: "Bad Request",
					detail: "Invalid request. Check the parameters sent.",
				},
				options,
			),
	},
	UNAUTHORIZED: {
		code: 401,
		title: "Unauthorized",
		detail: "Authentication required to access this resource.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 401,
					title: "Unauthorized",
					detail: "Authentication required to access this resource.",
				},
				options,
			),
	},
	PAYMENT_REQUIRED: {
		code: 402,
		title: "Payment Required",
		detail: "Payment Required.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 402,
					title: "Payment Required",
					detail: "Payment Required.",
				},
				options,
			),
	},
	FORBIDDEN: {
		code: 403,
		title: "Forbidden",
		detail: "You don't have permission to access this resource.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 403,
					title: "Forbidden",
					detail: "You don't have permission to access this resource.",
				},
				options,
			),
	},
	NOT_FOUND: {
		code: 404,
		title: "Not Found",
		detail: "The requested resource was not found.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 404,
					title: "Not Found",
					detail: "The requested resource was not found.",
				},
				options,
			),
	},
	METHOD_NOT_ALLOWED: {
		code: 405,
		title: "Method Not Allowed",
		detail: "Method Not Allowed.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 405,
					title: "Method Not Allowed",
					detail: "Method Not Allowed.",
				},
				options,
			),
	},
	NOT_ACCEPTABLE: {
		code: 406,
		title: "Not Acceptable",
		detail: "Not Acceptable.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 406,
					title: "Not Acceptable",
					detail: "Not Acceptable.",
				},
				options,
			),
	},
	PROXY_AUTHENTICATION_REQUIRED: {
		code: 407,
		title: "Proxy Authentication Required",
		detail: "Proxy Authentication Required.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 407,
					title: "Proxy Authentication Required",
					detail: "Proxy Authentication Required.",
				},
				options,
			),
	},
	REQUEST_TIMEOUT: {
		code: 408,
		title: "Request Timeout",
		detail: "Request Timeout.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 408,
					title: "Request Timeout",
					detail: "Request Timeout.",
				},
				options,
			),
	},
	CONFLICT: {
		code: 409,
		title: "Conflict",
		detail: "Request conflicts with the current state of the resource.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 409,
					title: "Conflict",
					detail: "Request conflicts with the current state of the resource.",
				},
				options,
			),
	},
	GONE: {
		code: 410,
		title: "Gone",
		detail: "Gone.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 410,
					title: "Gone",
					detail: "Gone.",
				},
				options,
			),
	},
	LENGTH_REQUIRED: {
		code: 411,
		title: "Length Required",
		detail: "Length Required.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 411,
					title: "Length Required",
					detail: "Length Required.",
				},
				options,
			),
	},
	PRECONDITION_FAILED: {
		code: 412,
		title: "Precondition Failed",
		detail: "Precondition Failed.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 412,
					title: "Precondition Failed",
					detail: "Precondition Failed.",
				},
				options,
			),
	},
	REQUEST_ENTITY_TOO_LARGE: {
		code: 413,
		title: "Request Entity Too Large",
		detail: "Request Entity Too Large.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 413,
					title: "Request Entity Too Large",
					detail: "Request Entity Too Large.",
				},
				options,
			),
	},
	REQUEST_TOO_LONG: {
		code: 413,
		title: "Request Entity Too Large",
		detail: "Request Entity Too Large.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 413,
					title: "Request Entity Too Large",
					detail: "Request Entity Too Large.",
				},
				options,
			),
	},
	REQUEST_URI_TOO_LONG: {
		code: 414,
		title: "Request URI Too Long",
		detail: "Request URI Too Long.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 414,
					title: "Request URI Too Long",
					detail: "Request URI Too Long.",
				},
				options,
			),
	},
	UNSUPPORTED_MEDIA_TYPE: {
		code: 415,
		title: "Unsupported Media Type",
		detail: "Unsupported Media Type.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 415,
					title: "Unsupported Media Type",
					detail: "Unsupported Media Type.",
				},
				options,
			),
	},
	REQUESTED_RANGE_NOT_SATISFIABLE: {
		code: 416,
		title: "Requested Range Not Satisfiable",
		detail: "Requested Range Not Satisfiable.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 416,
					title: "Requested Range Not Satisfiable",
					detail: "Requested Range Not Satisfiable.",
				},
				options,
			),
	},
	EXPECTATION_FAILED: {
		code: 417,
		title: "Expectation Failed",
		detail: "Expectation Failed.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 417,
					title: "Expectation Failed",
					detail: "Expectation Failed.",
				},
				options,
			),
	},
	IM_A_TEAPOT: {
		code: 418,
		title: "I'm a teapot",
		detail: "I'm a teapot.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 418,
					title: "I'm a teapot",
					detail: "I'm a teapot.",
				},
				options,
			),
	},
	INSUFFICIENT_SPACE_ON_RESOURCE: {
		code: 419,
		title: "Insufficient Space on Resource",
		detail: "Insufficient Space on Resource.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 419,
					title: "Insufficient Space on Resource",
					detail: "Insufficient Space on Resource.",
				},
				options,
			),
	},
	METHOD_FAILURE: {
		code: 420,
		title: "Method Failure",
		detail: "Method Failure.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 420,
					title: "Method Failure",
					detail: "Method Failure.",
				},
				options,
			),
	},
	MISDIRECTED_REQUEST: {
		code: 421,
		title: "Misdirected Request",
		detail: "Misdirected Request.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 421,
					title: "Misdirected Request",
					detail: "Misdirected Request.",
				},
				options,
			),
	},
	UNPROCESSABLE_ENTITY: {
		code: 422,
		title: "Unprocessable Entity",
		detail: "The data sent could not be processed.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 422,
					title: "Unprocessable Entity",
					detail: "The data sent could not be processed.",
				},
				options,
			),
	},
	LOCKED: {
		code: 423,
		title: "Locked",
		detail: "Locked.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 423,
					title: "Locked",
					detail: "Locked.",
				},
				options,
			),
	},
	FAILED_DEPENDENCY: {
		code: 424,
		title: "Failed Dependency",
		detail: "Failed Dependency.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 424,
					title: "Failed Dependency",
					detail: "Failed Dependency.",
				},
				options,
			),
	},
	TOO_EARLY: {
		code: 425,
		title: "Too Early",
		detail: "Too Early.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 425,
					title: "Too Early",
					detail: "Too Early.",
				},
				options,
			),
	},
	UPGRADE_REQUIRED: {
		code: 426,
		title: "Upgrade Required",
		detail: "Upgrade Required.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 426,
					title: "Upgrade Required",
					detail: "Upgrade Required.",
				},
				options,
			),
	},
	PRECONDITION_REQUIRED: {
		code: 428,
		title: "Precondition Required",
		detail: "Precondition Required.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 428,
					title: "Precondition Required",
					detail: "Precondition Required.",
				},
				options,
			),
	},
	TOO_MANY_REQUESTS: {
		code: 429,
		title: "Too Many Requests",
		detail: "Too many requests. Please try again later.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 429,
					title: "Too Many Requests",
					detail: "Too many requests. Please try again later.",
				},
				options,
			),
	},
	REQUEST_HEADER_FIELDS_TOO_LARGE: {
		code: 431,
		title: "Request Header Fields Too Large",
		detail: "Request Header Fields Too Large.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 431,
					title: "Request Header Fields Too Large",
					detail: "Request Header Fields Too Large.",
				},
				options,
			),
	},
	UNAVAILABLE_FOR_LEGAL_REASONS: {
		code: 451,
		title: "Unavailable For Legal Reasons",
		detail: "Unavailable For Legal Reasons.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 451,
					title: "Unavailable For Legal Reasons",
					detail: "Unavailable For Legal Reasons.",
				},
				options,
			),
	},
	INTERNAL_SERVER_ERROR: {
		code: 500,
		title: "Internal Server Error",
		detail: "An unexpected error occurred. Please try again later.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 500,
					title: "Internal Server Error",
					detail: "An unexpected error occurred. Please try again later.",
				},
				options,
			),
	},
	NOT_IMPLEMENTED: {
		code: 501,
		title: "Not Implemented",
		detail: "Not Implemented.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 501,
					title: "Not Implemented",
					detail: "Not Implemented.",
				},
				options,
			),
	},
	BAD_GATEWAY: {
		code: 502,
		title: "Bad Gateway",
		detail: "Invalid response received from upstream server.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 502,
					title: "Bad Gateway",
					detail: "Invalid response received from upstream server.",
				},
				options,
			),
	},
	SERVICE_UNAVAILABLE: {
		code: 503,
		title: "Service Unavailable",
		detail: "Service temporarily unavailable. Please try again later.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 503,
					title: "Service Unavailable",
					detail: "Service temporarily unavailable. Please try again later.",
				},
				options,
			),
	},
	GATEWAY_TIMEOUT: {
		code: 504,
		title: "Gateway Timeout",
		detail: "Upstream server took too long to respond.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 504,
					title: "Gateway Timeout",
					detail: "Upstream server took too long to respond.",
				},
				options,
			),
	},
	HTTP_VERSION_NOT_SUPPORTED: {
		code: 505,
		title: "HTTP Version Not Supported",
		detail: "HTTP Version Not Supported.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 505,
					title: "HTTP Version Not Supported",
					detail: "HTTP Version Not Supported.",
				},
				options,
			),
	},
	VARIANT_ALSO_NEGOTIATES: {
		code: 506,
		title: "Variant Also Negotiates",
		detail: "Variant Also Negotiates.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 506,
					title: "Variant Also Negotiates",
					detail: "Variant Also Negotiates.",
				},
				options,
			),
	},
	INSUFFICIENT_STORAGE: {
		code: 507,
		title: "Insufficient Storage",
		detail: "Insufficient Storage.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 507,
					title: "Insufficient Storage",
					detail: "Insufficient Storage.",
				},
				options,
			),
	},
	LOOP_DETECTED: {
		code: 508,
		title: "Loop Detected",
		detail: "Loop Detected.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 508,
					title: "Loop Detected",
					detail: "Loop Detected.",
				},
				options,
			),
	},
	NOT_EXTENDED: {
		code: 510,
		title: "Not Extended",
		detail: "Not Extended.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 510,
					title: "Not Extended",
					detail: "Not Extended.",
				},
				options,
			),
	},
	NETWORK_AUTHENTICATION_REQUIRED: {
		code: 511,
		title: "Network Authentication Required",
		detail: "Network Authentication Required.",
		response: (options: HttpErrorResponseOptions = {}) =>
			createErrorHttpResponse(
				{
					code: 511,
					title: "Network Authentication Required",
					detail: "Network Authentication Required.",
				},
				options,
			),
	},
} as const;

export type HttpStatusEntry = (typeof status)[keyof typeof status];
