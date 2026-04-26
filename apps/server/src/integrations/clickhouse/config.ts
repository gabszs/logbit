import type { ClickhouseConfig } from "./schemas";

export function normalizeClickhouseHost(host: string) {
	const url = new URL(host);
	return url.origin;
}

export function normalizeClickhouseConfig(
	config: ClickhouseConfig,
): ClickhouseConfig {
	return {
		...config,
		host: normalizeClickhouseHost(config.host),
	};
}
