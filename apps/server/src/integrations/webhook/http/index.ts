import type { ISender } from "../../interfaces/ISender";
import type { WebhookConfig } from "./schemas";

export class WebhookSender implements ISender {
	constructor(private readonly config: WebhookConfig) {}

	async send(msg: string): Promise<void> {
		await fetch(this.config.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(this.config.secret
					? { "X-Webhook-Secret": this.config.secret }
					: {}),
			},
			body: JSON.stringify({
				message: msg,
				timestamp: new Date().toISOString(),
			}),
		});
	}
}
