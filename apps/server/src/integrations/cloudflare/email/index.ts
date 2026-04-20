import type { ISender } from "../../interfaces/ISender";
import type { CloudflareEmailConfig } from "./schemas";

export class CloudflareEmailSender implements ISender {
	constructor(private readonly config: CloudflareEmailConfig) {}

	async send(msg: string): Promise<void> {
		await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/email/sending/send`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from: this.config.from,
					to: this.config.to,
					subject: "Notification",
					text: msg,
					html: `<p>${msg}</p>`,
				}),
			},
		);
	}
}
