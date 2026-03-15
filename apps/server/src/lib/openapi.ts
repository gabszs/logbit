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

	components: {
		securitySchemes: {
			bearerAuth: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "API Key",
				description:
					"Enter your API key in the format **Bearer &lt;api_key&gt;**. You can generate API keys from your dashboard at https://traki.io/dashboard/api-keys",
			},
		},
	},
};
