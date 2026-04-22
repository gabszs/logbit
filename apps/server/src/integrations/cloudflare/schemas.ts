import { z } from "zod";

export const CloudflareConfigSchema = z.object({
	apiKey: z.string().min(1, { message: "API Key is required" }),
	zoneId: z.string().min(1, { message: "Zone ID is required" }),
});

export type CloudflareConfig = z.infer<typeof CloudflareConfigSchema>;
