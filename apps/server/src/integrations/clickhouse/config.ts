import type { ClickhouseConfigType } from "./schemas";

export function normalizeClickhouseUrl(url: string) {
	const parsedUrl = new URL(url);
	return parsedUrl.origin;
}

export function normalizeClickhouseConfig(
	config: ClickhouseConfigType,
): ClickhouseConfigType {
	return {
		...config,
		url: normalizeClickhouseUrl(config.url),
	};
}
