import type { ClickhouseConfigType } from "./schemas";

export function normalizeClickhouseHost(host: string) {
	const url = new URL(host);
	return url.origin;
}

export function normalizeClickhouseConfig(
	config: ClickhouseConfigType,
): ClickhouseConfigType {
	return {
		...config,
		host: normalizeClickhouseHost(config.host),
	};
}
