import Cloudflare from "cloudflare";
import type { CloudflareConfig } from "./schemas";

export function createCloudflareClient(config: CloudflareConfig): Cloudflare {
	return new Cloudflare({ apiToken: config.apiKey });
}
