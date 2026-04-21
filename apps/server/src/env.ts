import z from "zod";

export const envSchema = z.object({
	// GENERAL SETTINGS
	SERVE_STATIC: z
		.string()
		.transform((v) => v !== "false")
		.default(false),
	HOSTNAME: z.string().default("http://localhost:5051"), // corrijir depois para abrajer edge cases
	API_PORT: z.coerce.number().default(5051),
	VITE_WEB_URL: z.string().default("http://localhost:5052"),
	REDIS_URL: z.string().startsWith("redis://").optional(),
	DATABASE_URL: z.string().startsWith("postgresql://"),
	CLICKHOUSE_URL: z
		.string()
		.startsWith("http://")
		.default("http://localhost:8123"),
	CORS_ORIGIN: z
		.string()
		.transform((val) => val.split(","))
		.default(["http://localhost:5052"]),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),

	// EPHEMERAL
	SCALAR_THEME: z
		.enum([
			"deepSpace",
			"default",
			"alternate",
			"moon",
			"purple",
			"solarized",
			"bluePlanet",
			"saturn",
			"kepler",
			"mars",
			"laserwave",
		])
		.default("deepSpace"), // TODO: migrate to settings.SCALAR_THEME
	ENABLE_OPEN_API: z
		.string()
		.transform((v) => v !== "false")
		.default(true),

	// Auth settings
	AUTH_SECRET: z.string().default("supersecret"),
	AUTH_SESSION_DURATION_SECONDS: z.coerce.number().default(1209600), // DEFAULT 14 DAYS
	AUTH_BASE_PATH: z.string().default("/v1/auth"),
	AUTH_OPEN_API_PATH: z.string().default("/docs"),
	AUTH_ENABLE_DELETE_ACCOUNT: z
		.string()
		.transform((v) => v !== "false")
		.default(true),
	AUTH_ALLOWED_EMAIL_DOMAINS: z
		.string()
		.transform((val) => val.split(","))
		.optional(),

	// rate-limit
	RATE_LIMIT_ENABLED: z
		.string()
		.transform((v) => v !== "false")
		.default(true),
	RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(1000),
	RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
	RATE_LIMIT_KEY_HEADER: z.string().default("x-forwarded-for"),
	RATE_LIMIT_SLIDING_WINDOW: z
		.string()
		.transform((v) => v !== "false")
		.default(true),
	RATE_LIMIT_HEADERS: z
		.union([z.enum(["draft-6", "draft-7"]), z.coerce.boolean()])
		.default("draft-7"),
	RATE_LIMIT_PREFIX: z.string().default("loglog-api-limit:"),

	// INTERNAL OTEL-SETTINGS
	OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default("http://localhost:4318"),
	OTEL_SERVICE_NAME: z.string().default("loglog-api"),
	OTEL_SERVICE_NAMESPACE: z.string().optional(),
	OTEL_SERVICE_VERSION: z.string().default("1.0.0"),
	OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER: z
		.string()
		.transform((val) => val.split(","))
		.default(["user-agent", "x-forwarded-for"]),
	OTEL_TRACE_HEADER_NAME: z.string().default("otel-trace-id"),
	OTEL_LOG_LEVEL: z.string().default("warn"),
});

export type Settings = z.infer<typeof envSchema>;

export const parseSettings = (
	source: NodeJS.ProcessEnv = process.env,
	overrides: Partial<Settings> = {},
): Settings => {
	const parsed = envSchema.parse(source);
	return {
		...parsed,
		...overrides,
	};
};

export const settings = parseSettings(process.env);
