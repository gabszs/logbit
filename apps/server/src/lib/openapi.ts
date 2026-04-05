import type { RouteConfig } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import type {
	Path as BetterAuthPathItem,
	FieldSchema,
	OpenAPIModelSchema,
} from "better-auth/plugins";
import { settings } from "@/env";
import type { AppType } from "@/types";
import { auth } from "./auth";

const HTTP_METHODS = [
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"head",
	"options",
	"trace",
] as const satisfies RouteConfig["method"][];

type HttpMethod = (typeof HTTP_METHODS)[number];
type BetterAuthOperation = NonNullable<
	BetterAuthPathItem[keyof BetterAuthPathItem]
>;
type BetterAuthSecurityScheme = {
	type: string;
	description?: string;
	in?: string;
	name?: string;
	scheme?: string;
};

type SchemaObjectType =
	| "integer"
	| "number"
	| "string"
	| "boolean"
	| "object"
	| "null"
	| "array";

type ReferenceObject = {
	$ref: string;
	summary?: string;
	description?: string;
};

type SchemaObject = {
	$ref?: string;
	type?: SchemaObjectType | SchemaObjectType[];
	format?: string;
	description?: string;
	default?: unknown;
	readOnly?: boolean;
	properties?: Record<string, SchemaObject | ReferenceObject>;
	items?: SchemaObject | ReferenceObject;
	additionalProperties?: SchemaObject | ReferenceObject | boolean;
	propertyNames?: SchemaObject | ReferenceObject;
	allOf?: Array<SchemaObject | ReferenceObject>;
	anyOf?: Array<SchemaObject | ReferenceObject>;
	oneOf?: Array<SchemaObject | ReferenceObject>;
	not?: SchemaObject | ReferenceObject;
	prefixItems?: Array<SchemaObject | ReferenceObject>;
	required?: string[];
	enum?: unknown[];
	example?: unknown;
	examples?: unknown[];
	deprecated?: boolean;
	title?: string;
	nullable?: boolean;
	[key: string]: unknown;
};

type ExternalDocumentationObject = {
	description?: string;
	url: string;
	[key: `x-${string}`]: unknown;
};

type TagObject = {
	name: string;
	description?: string;
	externalDocs?: ExternalDocumentationObject;
	[key: `x-${string}`]: unknown;
};

type SecurityRequirementObject = Record<string, string[]>;

type SecuritySchemeObject =
	| {
			type: "apiKey";
			in: "query" | "header" | "path" | "cookie";
			name: string;
			description?: string;
			[key: `x-${string}`]: unknown;
	  }
	| {
			type: "http";
			scheme: string;
			description?: string;
			bearerFormat?: string;
			[key: `x-${string}`]: unknown;
	  };

type MediaTypeObject = {
	schema?: SchemaObject | ReferenceObject;
	[key: string]: unknown;
};

type ParameterObject = {
	name: string;
	in: "query" | "header" | "path" | "cookie";
	description?: string;
	required?: boolean;
	schema?: SchemaObject | ReferenceObject;
	[key: string]: unknown;
};

type RequestBodyObject = {
	description?: string;
	content: Record<string, MediaTypeObject>;
	required?: boolean;
	[key: string]: unknown;
};

type ResponseObject = {
	description: string;
	content?: Record<string, MediaTypeObject>;
	[key: string]: unknown;
};

type OpenAPIObjectV31 = {
	openapi: string;
	info: {
		title: string;
		description?: string;
		version: string;
		contact?: {
			name?: string;
			email?: string;
			url?: string;
		};
		termsOfService?: string;
	};
	paths?: Record<string, unknown>;
	externalDocs?: ExternalDocumentationObject;
	tags?: TagObject[];
	[key: `x-${string}`]: unknown;
};

export const openApiSchema = {
	openapi: "3.1.0",
	paths: {},
	externalDocs: {
		description: "Official Documentation",
		url: "https://traki.io/docs",
	},
	info: {
		title: "Traki API",
		description:
			"Traki is a universal event tracking and analytics platform that empowers developers to capture, trace, and analyze user interactions across web and mobile applications. With built-in support for campaign tracking, custom event management, and real-time analytics, Traki provides the infrastructure for data-driven product decisions. Our globally distributed, low-latency API ensures reliable event capture and fast query performance for teams of any size.",
		version: "1.0.0",
		contact: {
			name: "Official Website",
			email: "gabrielcarvalho.workk@gmail.com",
			url: "https://traki.io",
		},
		termsOfService: "https://traki.io/privacy",
	},
} satisfies OpenAPIObjectV31;

const tagDescriptions: TagObject[] = [
	{
		name: "Utilities",
		description:
			"Auxiliary endpoints such as health checks and service status.",
	},
	{
		name: "Auth",
		description:
			"Core authentication endpoints including sign-in, sign-up, password reset, session management, and email verification.",
	},
	{
		name: "Api-key",
		description:
			"Manage API keys for programmatic access, including creation, listing, updating, and revocation.",
	},
	{
		name: "Phone-number",
		description:
			"Phone number authentication flows including OTP sending, verification, and password reset via SMS.",
	},
	{
		name: "Admin",
		description:
			"Administrative operations for managing users, sessions, roles, and permissions. Requires elevated privileges.",
	},
	{
		name: "Organization",
		description:
			"Manage organizations, members, invitations, and roles within a multi-tenant context.",
	},
	{
		name: "Cloudflare",
		description:
			"Endpoints integrated with Cloudflare infrastructure for edge-level operations and configurations.",
	},
];

function isHttpMethod(value: string): value is HttpMethod {
	return (HTTP_METHODS as readonly string[]).includes(value);
}

function mapDbFieldTypeToSchemaType(
	type: FieldSchema["type"],
): SchemaObject["type"] {
	switch (String(type)) {
		case "string":
		case "boolean":
			return String(type) as SchemaObject["type"];
		case "array":
		case "object":
			return String(type) as SchemaObject["type"];
		case "number":
			return "number";
		case "date":
			return "string";
		case "json":
			return "object";
		default:
			return "string";
	}
}

function normalizeSchemaObject(value: unknown): SchemaObject | ReferenceObject {
	if (!value || typeof value !== "object") {
		return { type: "string" };
	}

	if ("$ref" in value && typeof value.$ref === "string") {
		return { $ref: value.$ref };
	}

	const schema = value as Record<string, unknown>;
	const normalized: SchemaObject = {};

	for (const [key, entry] of Object.entries(schema)) {
		switch (key) {
			case "properties":
				normalized.properties = Object.fromEntries(
					Object.entries((entry as Record<string, unknown>) ?? {}).map(
						([propertyKey, propertyValue]) => [
							propertyKey,
							normalizeSchemaObject(propertyValue),
						],
					),
				);
				break;
			case "items":
			case "not":
			case "propertyNames":
				normalized[key] = normalizeSchemaObject(entry);
				break;
			case "additionalProperties":
				normalized.additionalProperties =
					typeof entry === "boolean" ? entry : normalizeSchemaObject(entry);
				break;
			case "allOf":
			case "anyOf":
			case "oneOf":
			case "prefixItems":
				normalized[key] = Array.isArray(entry)
					? entry.map((item) => normalizeSchemaObject(item))
					: undefined;
				break;
			case "type":
				if (Array.isArray(entry)) {
					normalized.type = entry.filter(
						(type): type is SchemaObjectType => typeof type === "string",
					);
				} else if (typeof entry === "string") {
					normalized.type = entry as SchemaObject["type"];
				}
				break;
			default:
				normalized[key as keyof SchemaObject] = entry as never;
		}
	}

	return normalized;
}

function mapBetterAuthFieldSchema(field: FieldSchema): SchemaObject {
	const schema: SchemaObject = {
		type: mapDbFieldTypeToSchemaType(field.type),
	};

	if (field.default !== undefined) {
		schema.default = field.default;
	}

	if (field.readOnly !== undefined) {
		schema.readOnly = field.readOnly;
	}

	if (field.format) {
		schema.format = field.format;
	}

	if (field.type === "date") {
		schema.format = "date-time";
	}

	if (field.type === "json") {
		schema.additionalProperties = true;
	}

	return schema;
}

function mapBetterAuthSchemaToOpenApiSchema(
	schema: OpenAPIModelSchema,
): SchemaObject {
	return {
		type: "object",
		properties: Object.fromEntries(
			Object.entries(schema.properties).map(([key, value]) => [
				key,
				mapBetterAuthFieldSchema(value),
			]),
		),
		required: schema.required,
	};
}

function mapBetterAuthSecurityScheme(
	scheme: BetterAuthSecurityScheme,
): SecuritySchemeObject {
	if (scheme.type === "apiKey") {
		return {
			type: "apiKey",
			in:
				scheme.in === "query" ||
				scheme.in === "header" ||
				scheme.in === "path" ||
				scheme.in === "cookie"
					? scheme.in
					: "header",
			name: scheme.name ?? "Authorization",
			description: scheme.description,
		};
	}

	return {
		type: "http",
		scheme: scheme.scheme ?? "bearer",
		description: scheme.description,
	};
}

function mapBetterAuthParameters(
	parameters: BetterAuthOperation["parameters"],
): Array<ParameterObject | ReferenceObject> | undefined {
	if (!parameters) {
		return undefined;
	}

	return parameters.map((parameter) => {
		if ("$ref" in parameter && typeof parameter.$ref === "string") {
			return { $ref: parameter.$ref };
		}

		return {
			...(parameter as unknown as Record<string, unknown>),
			schema: parameter.schema
				? normalizeSchemaObject(parameter.schema)
				: undefined,
		} as ParameterObject;
	});
}

function mapBetterAuthRequestBody(
	requestBody: RequestBodyObject | undefined,
): RequestBodyObject | ReferenceObject | undefined {
	if (!requestBody) {
		return undefined;
	}

	const content = (requestBody.content ?? {}) as Record<
		string,
		Record<string, unknown> & { schema?: unknown }
	>;

	return {
		...requestBody,
		...(Object.keys(content).length > 0
			? {
					content: Object.fromEntries(
						Object.entries(content).map(([contentType, mediaType]) => [
							contentType,
							{
								...mediaType,
								schema: mediaType.schema
									? normalizeSchemaObject(mediaType.schema)
									: undefined,
							},
						]),
					),
				}
			: {}),
	};
}

function mapBetterAuthResponses(
	responses: BetterAuthOperation["responses"],
): RouteConfig["responses"] {
	if (!responses) {
		return {
			"200": {
				description: "Successful response",
			},
		};
	}

	return Object.fromEntries(
		Object.entries(responses).map(([status, response]) => [
			status,
			(() => {
				const content = (response.content ?? {}) as Record<
					string,
					Record<string, unknown> & { schema?: unknown }
				>;

				return {
					description: response.description ?? "Response",
					...(Object.keys(content).length > 0
						? {
								content: Object.fromEntries(
									Object.entries(content).map(([contentType, mediaType]) => [
										contentType,
										{
											...mediaType,
											schema: mediaType.schema
												? normalizeSchemaObject(mediaType.schema)
												: undefined,
										},
									]),
								),
							}
						: {}),
				} satisfies ResponseObject;
			})(),
		]),
	) as RouteConfig["responses"];
}

function mapBetterAuthSecurity(
	security: BetterAuthOperation["security"],
): SecurityRequirementObject[] | undefined {
	return security?.map((entry) => ({ ...entry }));
}

function mapBetterAuthOperationToRouteConfig(
	method: HttpMethod,
	path: string,
	operation: BetterAuthOperation,
): RouteConfig {
	const requestBody =
		"requestBody" in operation
			? mapBetterAuthRequestBody(operation.requestBody)
			: undefined;

	return {
		method,
		path,
		description: operation.description,
		operationId: operation.operationId,
		parameters: mapBetterAuthParameters(operation.parameters),
		requestBody,
		responses: mapBetterAuthResponses(operation.responses),
		security: mapBetterAuthSecurity(operation.security),
		summary: path,
		tags: operation.tags?.map((tag) => (tag === "Default" ? "Auth" : tag)),
	};
}

export function setupOpenApi(app: AppType) {
	app.doc("/open-api", { ...openApiSchema, tags: tagDescriptions });

	app.get(
		"/docs",
		Scalar({
			pageTitle: "LogLog Documentation",
			sources: [{ url: "/open-api", title: "API" }],
			metaData: {
				title: "LogLog docs",
				description: "Complete API documentation for LogLog platform",
			},
			theme: settings.SCALAR_THEME,
			authentication: {
				preferredSecurityScheme: "bearerAuth",
				securitySchemes: {
					bearerAuth: {
						token: "loglog_session_token",
					},
					apiKeyCookie: {
						value: "loglog_cookie",
					},
				},
			},
		}),
	);

	(async () => {
		const schema = await auth.api.generateOpenAPISchema();

		for (const [key, value] of Object.entries(
			schema.components?.securitySchemes ?? {},
		)) {
			app.openAPIRegistry.registerComponent(
				"securitySchemes",
				key,
				mapBetterAuthSecurityScheme(value),
			);
		}

		for (const [key, value] of Object.entries(
			schema.components?.schemas ?? {},
		)) {
			app.openAPIRegistry.registerComponent(
				"schemas",
				key,
				mapBetterAuthSchemaToOpenApiSchema(value),
			);
		}

		for (const [path, pathItem] of Object.entries(schema.paths ?? {})) {
			const fullPath = `${settings.AUTH_BASE_PATH}${path}`;

			for (const [method, operation] of Object.entries(
				pathItem as BetterAuthPathItem,
			)) {
				if (!isHttpMethod(method) || !operation) {
					continue;
				}

				app.openAPIRegistry.registerPath(
					mapBetterAuthOperationToRouteConfig(
						method,
						fullPath,
						operation as BetterAuthOperation,
					),
				);
			}
		}

		const content = app.getOpenAPI31Document(openApiSchema);
		const aiMarkdown = await createMarkdownFromOpenApi(JSON.stringify(content));
		app.get("llms.txt", (c) => c.text(aiMarkdown));
	})();
}
