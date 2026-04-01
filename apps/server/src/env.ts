import z from "zod";

const envSchema = z.object({
	// GENERAL SETTINGS
	API_PORT: z.coerce.number().default(5151),
	REDIS_URL: z.string().startsWith("redis://").optional(),
	DATABASE_URL: z.string().startsWith("postgresql://"),
	CORS_ORIGIN: z
		.string()
		.transform((val) => val.split(","))
		.default(["http://localhost:5152"]),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),

	// EPHEMERAL
	SCALAR_THEME: z.string().default("deepSpace"),
	ENABLE_OPEN_API: z.coerce.boolean().default(true),

	// Auth settings
	AUTH_SECRET: z.string().default("supersecret"),
	AUTH_SALT: z.string().default("supersalt"),
	AUTH_SESSION_MAX_AGE: z.string().default("7d"),
	AUTH_BASE_PATH: z.string().default("/v1/auth"),
	AUTH_OPEN_API_PATH: z.string().default("/docs"),
	AUTH_ENABLE_DELETE_ACCOUNT: z.coerce.boolean().default(true),

	// rate-limit
	RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
	RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(1000),
	RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
	RATE_LIMIT_KEY_HEADER: z.string().default("x-forwarded-for"),
	RATE_LIMIT_SLIDING_WINDOW: z.coerce.boolean().default(true),
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

export const settings = envSchema.parse(process.env);
