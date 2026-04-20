import z from "zod";
import type { IntegrationsType } from "@/features/integrations/schemas";
import { CloudflareEmailSender } from "./cloudflare/email";
import { CloudflareEmailConfigSchema } from "./cloudflare/email/schemas";
import type { ISender } from "./interfaces/ISender";
import { ResendSender } from "./resend/api";
import { ResendConfigSchema } from "./resend/api/schemas";
import { WebhookSender } from "./webhook/http";
import { WebhookConfigSchema } from "./webhook/http/schemas";

export const supportedIntegrationTypes = [
	"webhook",
	"cloudflare_email",
	"resend",
] as const;

export const supportedIntegrationSchemas = z.union([
	WebhookConfigSchema,
	CloudflareEmailConfigSchema,
	ResendConfigSchema,
]);

export function createSender(
	integration: IntegrationsType,
	error?: Error,
): ISender {
	switch (integration.type) {
		case "webhook":
			return new WebhookSender(WebhookConfigSchema.parse(integration.config));
		case "cloudflare_email":
			return new CloudflareEmailSender(
				CloudflareEmailConfigSchema.parse(integration.config),
			);
		case "resend":
			return new ResendSender(ResendConfigSchema.parse(integration.config));
		default:
			throw (
				error ??
				new Error(
					`Unsupported integration type: "${(integration as IntegrationsType).type}"`,
				)
			);
	}
}
