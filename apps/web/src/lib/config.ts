function getRequiredEnv(name: string, value: string | undefined) {
	if (!value) {
		throw new Error(`${name} is not defined`);
	}

	return value;
}

function parseSampleRatio(value: string | undefined) {
	if (!value) return 1;

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 1;

	return Math.min(Math.max(parsed, 0), 1);
}

const serverUrl = getRequiredEnv(
	"VITE_SERVER_URL",
	import.meta.env.VITE_SERVER_URL,
);

export const settings = {
	serverUrl,
	otel: {
		enabled: import.meta.env.VITE_OTEL_ENABLED === "true",
		collectorUrl: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT?.trim(),
		serviceName: import.meta.env.VITE_OTEL_SERVICE_NAME ?? "loglog-web",
		serviceVersion: import.meta.env.VITE_OTEL_SERVICE_VERSION?.trim(),
		sampleRatio: parseSampleRatio(import.meta.env.VITE_OTEL_SAMPLE_RATIO),
		consoleErrorEnabled:
			import.meta.env.VITE_OTEL_CONSOLE_ERROR_ENABLED === "true",
		propagateToUrls: [/.*/],
	},
} as const;
