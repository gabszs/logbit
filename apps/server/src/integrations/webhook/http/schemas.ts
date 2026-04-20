import { z } from "zod";

export const WebhookConfigSchema = z.object({
	url: z.url(),
	secret: z.string().optional(),
});

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
