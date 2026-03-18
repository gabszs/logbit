import { settings } from "@/env";
import type { AppType } from "@/types";
import { Scalar } from "@scalar/hono-api-reference";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import { auth } from "./auth";

export const openApiSchema = {
	openapi: "3.0.3",
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
};

const tagDescriptions: { name: string; description: string }[] = [
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
	}
];

export async function setupOpenApi(app: AppType) {
	const schema = await auth.api.generateOpenAPISchema();

	for (const [key, value] of Object.entries(
		schema.components?.securitySchemes ?? {},
	)) {
		app.openAPIRegistry.registerComponent("securitySchemes", key, value);
	}
	for (const [key, value] of Object.entries(schema.components?.schemas ?? {})) {
		app.openAPIRegistry.registerComponent("schemas", key, value);
	}
	for (const [path, pathItem] of Object.entries(schema.paths ?? {})) {
		const fullPath = `${settings.AUTH_BASE_PATH}${path}`;
		for (const [method, operation] of Object.entries(pathItem)) {
			const op = operation as any;
			app.openAPIRegistry.registerPath({
				method: method as any,
				path: fullPath,
				...op,
				summary: path,
				tags: op.tags?.map((tag: string) => (tag === "Default" ? "Auth" : tag)),
			});
		}
	}

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
						token: "loglog_session_token", // valor padrão, o usuário preenche na UI
					},
					apiKeyCookie: {
						value: "loglog_cookie",
					},
				},
			},
		}),
	);

	const content = app.getOpenAPI31Document(openApiSchema);
	const aiMarkdown = await createMarkdownFromOpenApi(JSON.stringify(content));
	app.get("llms.txt", (c) => c.text(aiMarkdown));
}
