import { z } from "zod";

export const ResendConfigSchema = z.object({
	apiKey: z.string().min(1, { message: "API Key is required" }),
	from: z.string().email({ message: "Invalid sender email" }),
	to: z
		.array(z.string().email())
		.min(1, { message: "At least one recipient is required" }),
});

export type ResendConfig = z.infer<typeof ResendConfigSchema>;
