import v8 from "node:v8";
import { BunFetchInstrumentation } from "@loglog/bun-instrumentation-fetch";
import { BunPgInstrumentation } from "@loglog/bun-instrumentation-pg";
import { BunRedisInstrumentation } from "@loglog/bun-instrumentation-redis";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
	ATTR_SERVICE_NAME,
	ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { settings } from "@/env";

// Polyfill for Bun compatibility to prevent OTel crash
v8.getHeapSpaceStatistics = () => [
	{
		space_name: "new_space",
		space_size: 0,
		space_used_size: 0,
		space_available_size: 0,
		physical_space_size: 0,
	},
];

const sdk = new NodeSDK({
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: settings.OTEL_SERVICE_NAME,
		[ATTR_SERVICE_VERSION]: settings.OTEL_SERVICE_VERSION,
	}),
	traceExporter: new OTLPTraceExporter(),
	metricReaders: [
		new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter(),
		}),
	],
	instrumentations: [
		new BunPgInstrumentation(),
		new BunRedisInstrumentation(),
		new BunFetchInstrumentation(),
		new HttpInstrumentation({
			enabled: true,
		}),
		// new UndiciInstrumentation(),
		// new RuntimeNodeInstrumentation(),
	],
});

diag.setLogger(new DiagConsoleLogger(), {
	logLevel: DiagLogLevel.WARN,
	suppressOverrideMessage: true,
});

sdk.start();

const hostMetrics = new HostMetrics({ name: settings.OTEL_SERVICE_NAME });
hostMetrics.start();

const shutdownSignals = ["SIGTERM", "SIGINT", "SIGQUIT", "uncaughtException"];

for (const signal of shutdownSignals) {
	process.on(signal, (errorOrEvent) => {
		if (signal === "uncaughtException") {
			console.error("Uncaught exception:", errorOrEvent);
		}

		sdk
			.shutdown()
			.then(() => console.log("OpenTelemetry SDK shut down successfully"))
			.catch((error) =>
				console.error("Error shutting down OpenTelemetry SDK", error),
			)
			.finally(() => {
				if (signal !== "uncaughtException") process.exit(0);
			});
	});
}
