import { z } from "zod";

export const ClickhouseConfigSchema = z.object({
	url: z.url({
		message: "URL must be valid (e.g. http://localhost:8123)",
	}),
	database: z.union([z.string().min(1), z.null()]),
	username: z.string().min(1, { message: "Username is required" }),
	password: z.string().nullable(),
});

export type ClickhouseConfigType = z.infer<typeof ClickhouseConfigSchema>;
