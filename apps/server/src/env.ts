import z from "zod";

const envSchema = z.object({
	DATABASE_URL: z.string().startsWith("postgresql://"),
	CORS_ORIGIN: z
		.string()
		.default("http://localhost:3000,http://localhost:3001"),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),

	AUTH_SECRET: z.string().default("supersecret"),
	AUTH_SALT: z.string().default("supersalt"),
	AUTH_SESSION_MAX_AGE: z.string().default("7d"),
	AUTH_BASE_PATH: z.string().default("/v1/auth"),
});

export const settings = envSchema.parse(Bun.env);
