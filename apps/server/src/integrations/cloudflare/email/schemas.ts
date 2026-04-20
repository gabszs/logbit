import { z } from "zod";

export const CloudflareEmailConfigSchema = z.object({
	apiToken: z.string().min(1, { message: "API Token is required" }),
	accountId: z.string().min(1, { message: "Account ID is required" }),
	from: z.email({ message: "Invalid sender email" }),
	to: z
		.array(z.email())
		.min(1, { message: "At least one recipient is required" }),
});

export type CloudflareEmailConfig = z.infer<typeof CloudflareEmailConfigSchema>;
