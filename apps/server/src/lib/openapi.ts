import { Scalar } from "@scalar/hono-api-reference";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import { settings } from "@/env";
import type { AppType } from "@/types";

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
	}
};

export async function setupOpenApi(app: AppType) {
	app.doc("/open-api", openApiSchema);

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
});

app.get(
    "/docs",
    Scalar({
        pageTitle: "LogLog Documentation",
        sources: [
            { url: "/open-api", title: "API" },
            { url: "/api/auth/open-api/generate-schema", title: "Auth" },
        ],
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
            },
        },
    })
);

	const content = app.getOpenAPI31Document(openApiSchema);
	const aiMarkdown = await createMarkdownFromOpenApi(JSON.stringify(content));
	app.get("llms.txt", (c) => c.text(aiMarkdown));
}
