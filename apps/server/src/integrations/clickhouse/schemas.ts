import { z } from "zod";

export const ClickhouseConfigSchema = z.object({
	host: z.url({ message: "Host must be a valid URL (e.g. http://localhost:8123)" }),
	database: z.union([z.string().min(1), z.null()]),
	username: z.string().min(1, { message: "Username is required" }),
	password: z.string().nullable(),
});

export type ClickhouseConfig = z.infer<typeof ClickhouseConfigSchema>;
