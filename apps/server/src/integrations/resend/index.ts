import { Resend } from "resend";
import type { ResendConfigType } from "./schemas";

export type ResendClient = Resend;

export function createResendClient(config: ResendConfigType): Resend {
	return new Resend(config.apiKey);
}
