import Cloudflare from "cloudflare";
import type { CloudflareConfig } from "./schemas";

export type CloudflareClient = Cloudflare;

export function createCloudflareClient(config: CloudflareConfig): Cloudflare {
	return new Cloudflare({ apiToken: config.apiKey });
}
