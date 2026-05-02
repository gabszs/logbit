import { z } from "zod";

export const ResendConfigSchema = z.object({
	apiKey: z
		.string()
		.min(1, { message: "API Key is required" })
		.startsWith("re_", { message: "API Key must start with 're_'" }),
});

export type ResendConfigType = z.infer<typeof ResendConfigSchema>;
