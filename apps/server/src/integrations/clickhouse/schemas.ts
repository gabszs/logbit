import { z } from "zod";

export const ClickhouseConfigSchema = z.object({
	host: z.url({ message: "Host must be a valid URL (e.g. http://localhost:8123)" }),
	database: z.string().min(1, { message: "Database is required" }),
	username: z.string().min(1, { message: "Username is required" }),
	password: z.string(),
});

export type ClickhouseConfig = z.infer<typeof ClickhouseConfigSchema>;
