import { Resend } from "resend";
import type { ResendConfig } from "./schemas";

export function createResendClient(config: ResendConfig): Resend {
	return new Resend(config.apiKey);
}
