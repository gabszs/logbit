import type { ISender } from "../../interfaces/ISender";
import type { ResendConfig } from "./schemas";

export class ResendSender implements ISender {
	constructor(private readonly config: ResendConfig) {}

	async send(msg: string): Promise<void> {
		await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: this.config.from,
				to: this.config.to,
				subject: "Notification",
				html: `<p>${msg}</p>`,
			}),
		});
	}
}
