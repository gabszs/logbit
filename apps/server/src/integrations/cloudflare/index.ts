import Cloudflare from "cloudflare";
import type { CloudflareConfigType } from "./schemas";

export type CloudflareClient = Cloudflare;

export function createCloudflareClient(
	config: CloudflareConfigType,
): Cloudflare {
	return new Cloudflare({ apiToken: config.apiKey });
}
