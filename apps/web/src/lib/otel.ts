import type { Histogram } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import {
	CompositePropagator,
	W3CBaggagePropagator,
	W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import type { FetchCustomAttributeFunction } from "@opentelemetry/instrumentation-fetch";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchLogRecordProcessor,
	LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
	MeterProvider,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
	BatchSpanProcessor,
	ParentBasedSampler,
	TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import {
	ATTR_ERROR_TYPE,
	ATTR_HTTP_REQUEST_METHOD,
	ATTR_HTTP_REQUEST_METHOD_ORIGINAL,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_NETWORK_TRANSPORT,
	ATTR_SERVER_ADDRESS,
	ATTR_SERVER_PORT,
	ATTR_SERVICE_NAME,
	ATTR_SERVICE_VERSION,
	ATTR_URL_FULL,
	ATTR_URL_PATH,
	ATTR_URL_SCHEME,
	ATTR_USER_AGENT_ORIGINAL,
	HTTP_REQUEST_METHOD_VALUE_CONNECT,
	HTTP_REQUEST_METHOD_VALUE_DELETE,
	HTTP_REQUEST_METHOD_VALUE_GET,
	HTTP_REQUEST_METHOD_VALUE_HEAD,
	HTTP_REQUEST_METHOD_VALUE_OPTIONS,
	HTTP_REQUEST_METHOD_VALUE_OTHER,
	HTTP_REQUEST_METHOD_VALUE_PATCH,
	HTTP_REQUEST_METHOD_VALUE_POST,
	HTTP_REQUEST_METHOD_VALUE_PUT,
	HTTP_REQUEST_METHOD_VALUE_TRACE,
	NETWORK_TRANSPORT_VALUE_TCP,
} from "@opentelemetry/semantic-conventions";
import type { Metric } from "web-vitals";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { settings } from "@/web/lib/config";
import { initLogHandler } from "@/web/lib/log-handler";
import { getSessionId } from "@/web/lib/session";

const KNOWN_HTTP_METHODS = new Set([
	HTTP_REQUEST_METHOD_VALUE_CONNECT,
	HTTP_REQUEST_METHOD_VALUE_DELETE,
	HTTP_REQUEST_METHOD_VALUE_GET,
	HTTP_REQUEST_METHOD_VALUE_HEAD,
	HTTP_REQUEST_METHOD_VALUE_OPTIONS,
	HTTP_REQUEST_METHOD_VALUE_PATCH,
	HTTP_REQUEST_METHOD_VALUE_POST,
	HTTP_REQUEST_METHOD_VALUE_PUT,
	"QUERY",
	HTTP_REQUEST_METHOD_VALUE_TRACE,
]);

const SENSITIVE_QUERY_PARAMETERS = new Set([
	"AWSAccessKeyId",
	"Signature",
	"sig",
	"X-Goog-Signature",
]);

const METRIC_EXPORT_INTERVAL_MS = 30_000;
const UUID_SEGMENT_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_SEGMENT_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const OBJECT_ID_SEGMENT_PATTERN = /^[0-9a-f]{24}$/i;
const OPAQUE_ID_SEGMENT_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9_-]{12,}$/;

let webVitalTtfbHistogram: Histogram | undefined;
let webVitalFcpHistogram: Histogram | undefined;
let webVitalLcpHistogram: Histogram | undefined;
let webVitalInpHistogram: Histogram | undefined;
let webVitalClsHistogram: Histogram | undefined;

function joinOtlpTraceUrl(collectorUrl: string) {
	return `${collectorUrl.replace(/\/+$/, "")}/v1/traces`;
}

function joinOtlpMetricUrl(collectorUrl: string) {
	return `${collectorUrl.replace(/\/+$/, "")}/v1/metrics`;
}

function joinOtlpLogUrl(collectorUrl: string) {
	return `${collectorUrl.replace(/\/+$/, "")}/v1/logs`;
}

function detectOs(userAgent: string) {
	if (/android/i.test(userAgent)) return "android";
	if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
	if (/windows/i.test(userAgent)) return "windows";
	if (/mac os|macintosh/i.test(userAgent)) return "macos";
	if (/linux/i.test(userAgent)) return "linux";
	return "unknown";
}

function isMobile(userAgent: string) {
	return /android|iphone|ipad|ipod|mobile/i.test(userAgent);
}

function getBrowserInfo(userAgent: string) {
	const edge = userAgent.match(/\bEdg\/([\d.]+)/);
	if (edge) {
		return {
			name: "Edge",
			version: edge[1],
			versionMajor: edge[1]?.split(".")[0] ?? "unknown",
		};
	}

	const chrome = userAgent.match(/\b(?:Chrome|CriOS)\/([\d.]+)/);
	if (chrome) {
		return {
			name: "Chrome",
			version: chrome[1],
			versionMajor: chrome[1]?.split(".")[0] ?? "unknown",
		};
	}

	const firefox = userAgent.match(/\b(?:Firefox|FxiOS)\/([\d.]+)/);
	if (firefox) {
		return {
			name: "Firefox",
			version: firefox[1],
			versionMajor: firefox[1]?.split(".")[0] ?? "unknown",
		};
	}

	const safari = userAgent.match(/\bVersion\/([\d.]+).*Safari\//);
	if (safari) {
		return {
			name: "Safari",
			version: safari[1],
			versionMajor: safari[1]?.split(".")[0] ?? "unknown",
		};
	}

	return {
		name: "unknown",
		version: "unknown",
		versionMajor: "unknown",
	};
}

function isOpaquePathId(segment: string) {
	return (
		UUID_SEGMENT_PATTERN.test(segment) ||
		ULID_SEGMENT_PATTERN.test(segment) ||
		OBJECT_ID_SEGMENT_PATTERN.test(segment) ||
		OPAQUE_ID_SEGMENT_PATTERN.test(segment)
	);
}

function normalizePagePath(pathname: string) {
	const normalizedPath = pathname.replace(/\/+$/, "") || "/";

	if (/^\/settings\/invitations\/[^/]+$/.test(normalizedPath)) {
		return "/settings/invitations/*";
	}

	const segments = normalizedPath.split("/").filter(Boolean);
	if (segments.length === 0) return "/";

	const normalizedSegments = segments.map((segment) => {
		if (!isOpaquePathId(segment)) return segment;
		return "*";
	});

	return `/${normalizedSegments.join("/")}`;
}

function getBrowserResourceAttributes() {
	const userAgent = navigator.userAgent;
	const browser = getBrowserInfo(userAgent);
	const mobile = isMobile(userAgent);
	const attributes = {
		[ATTR_SERVICE_NAME]: settings.otel.serviceName,
		"session.id": getSessionId(),
		[ATTR_USER_AGENT_ORIGINAL]: userAgent,
		"os.type": detectOs(userAgent),
		"os.name": navigator.platform,
		"device.type": mobile ? "mobile" : "desktop",
		"browser.name": browser.name,
		"browser.version": browser.version,
		"browser.version_major": browser.versionMajor,
		"browser.mobile": mobile,
		"browser.platform": navigator.platform,
		"browser.language": navigator.language,
	};

	return settings.otel.serviceVersion
		? {
				...attributes,
				[ATTR_SERVICE_VERSION]: settings.otel.serviceVersion,
			}
		: attributes;
}

function getHttpComponent(url: URL) {
	if (
		settings.otel.collectorUrl &&
		(url.href.startsWith(joinOtlpTraceUrl(settings.otel.collectorUrl)) ||
			url.href.startsWith(joinOtlpMetricUrl(settings.otel.collectorUrl)) ||
			url.href.startsWith(joinOtlpLogUrl(settings.otel.collectorUrl)))
	) {
		return "otel-exporter";
	}

	if (url.pathname.startsWith("/orpc")) return "orpc";
	if (url.pathname.startsWith("/v1/auth")) return "better-auth";
	if (url.pathname.startsWith("/v1/proxy/connections")) {
		return "clickhouse-client";
	}
	if (url.pathname.startsWith("/v1")) return "hono-rpc";
	return "fetch";
}

function getSanitizedUrl(value: string) {
	const url = new URL(value);

	if (url.username) url.username = "REDACTED";
	if (url.password) url.password = "REDACTED";

	for (const key of SENSITIVE_QUERY_PARAMETERS) {
		if (url.searchParams.has(key)) {
			url.searchParams.set(key, "REDACTED");
		}
	}

	return url;
}

function getRequestUrl(
	request: Request | RequestInit,
	result: Parameters<FetchCustomAttributeFunction>[2],
) {
	if (result instanceof Response) return result.url;
	if (request instanceof Request) return request.url;
	return undefined;
}

function getRequestMethod(request: Request | RequestInit) {
	return request.method;
}

function getNormalizedMethod(method: string | undefined) {
	const original = method || "GET";
	const normalized = original.toUpperCase();

	return {
		original,
		normalized: KNOWN_HTTP_METHODS.has(normalized)
			? normalized
			: HTTP_REQUEST_METHOD_VALUE_OTHER,
	};
}

function getServerPort(url: URL) {
	const explicitPort = Number(url.port);
	if (Number.isFinite(explicitPort) && explicitPort > 0) {
		return explicitPort;
	}

	if (url.protocol === "http:") return 80;
	if (url.protocol === "https:") return 443;
	return undefined;
}

function getRequestUrlAtStart(request: Request | RequestInit) {
	if (request instanceof Request) return request.url;
	return undefined;
}

function setStableHttpRequestAttributes(
	span: Parameters<FetchCustomAttributeFunction>[0],
	request: Request | RequestInit,
	requestUrl: string,
) {
	const url = getSanitizedUrl(requestUrl);
	const queryParamNames = Array.from(url.searchParams.keys());
	const method = getNormalizedMethod(getRequestMethod(request));
	const serverPort = getServerPort(url);

	span.setAttribute("loglog.component", getHttpComponent(url));
	span.setAttribute(ATTR_HTTP_REQUEST_METHOD, method.normalized);
	span.setAttribute(ATTR_URL_FULL, url.href);
	span.setAttribute(ATTR_SERVER_ADDRESS, url.hostname);
	span.setAttribute(ATTR_URL_SCHEME, url.protocol.replace(":", ""));
	span.setAttribute(ATTR_URL_PATH, url.pathname);
	span.setAttribute(ATTR_USER_AGENT_ORIGINAL, navigator.userAgent);

	if (method.normalized !== method.original) {
		span.setAttribute(ATTR_HTTP_REQUEST_METHOD_ORIGINAL, method.original);
	}

	if (serverPort) {
		span.setAttribute(ATTR_SERVER_PORT, serverPort);
	}

	if (queryParamNames.length > 0) {
		span.setAttribute("loglog.http.query.param_names", queryParamNames);
	}

	if (url.protocol === "http:" || url.protocol === "https:") {
		span.setAttribute(ATTR_NETWORK_TRANSPORT, NETWORK_TRANSPORT_VALUE_TCP);
	}
}

function setFetchSpanStartAttributes(
	span: Parameters<FetchCustomAttributeFunction>[0],
	request: Request | RequestInit,
) {
	const requestUrl = getRequestUrlAtStart(request);
	if (!requestUrl) return;

	setStableHttpRequestAttributes(span, request, requestUrl);
}

const applyFetchSpanAttributes: FetchCustomAttributeFunction = (
	span,
	request,
	result,
) => {
	const requestUrl = getRequestUrl(request, result);
	if (!requestUrl) return;

	setStableHttpRequestAttributes(span, request, requestUrl);

	if (!(result instanceof Response)) {
		span.setAttribute(
			ATTR_ERROR_TYPE,
			result instanceof Error ? result.name : "_OTHER",
		);
		return;
	}

	span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, result.status);

	if (result.status >= 400) {
		span.setAttribute(ATTR_ERROR_TYPE, result.status.toString());
	}
};

function initializeTracePipeline(
	resource: ReturnType<typeof resourceFromAttributes>,
	collectorUrl: string,
) {
	const provider = new WebTracerProvider({
		resource,
		sampler: new ParentBasedSampler({
			root: new TraceIdRatioBasedSampler(settings.otel.sampleRatio),
		}),
		spanProcessors: [
			new BatchSpanProcessor(
				new OTLPTraceExporter({
					url: joinOtlpTraceUrl(collectorUrl),
				}),
			),
		],
	});

	provider.register({
		contextManager: new ZoneContextManager(),
		propagator: new CompositePropagator({
			propagators: [
				new W3CTraceContextPropagator(),
				new W3CBaggagePropagator(),
			],
		}),
	});

	registerInstrumentations({
		instrumentations: [
			new FetchInstrumentation({
				applyCustomAttributesOnSpan: applyFetchSpanAttributes,
				clearTimingResources: true,
				propagateTraceHeaderCorsUrls: [...settings.otel.propagateToUrls],
				requestHook: setFetchSpanStartAttributes,
				semconvStabilityOptIn: "http",
			}),
		],
	});
}

function initializeMetricPipeline(
	resource: ReturnType<typeof resourceFromAttributes>,
	collectorUrl: string,
) {
	const meterProvider = new MeterProvider({
		resource,
		readers: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({
					url: joinOtlpMetricUrl(collectorUrl),
				}),
				exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
			}),
		],
	});

	metrics.setGlobalMeterProvider(meterProvider);

	const meter = meterProvider.getMeter("loglog-web");

	webVitalTtfbHistogram = meter.createHistogram("web.vital.ttfb", {
		description: "Time to First Byte reported by the browser",
		unit: "ms",
	});
	webVitalFcpHistogram = meter.createHistogram("web.vital.fcp", {
		description: "First Contentful Paint reported by the browser",
		unit: "ms",
	});
	webVitalLcpHistogram = meter.createHistogram("web.vital.lcp", {
		description: "Largest Contentful Paint reported by the browser",
		unit: "ms",
	});
	webVitalInpHistogram = meter.createHistogram("web.vital.inp", {
		description: "Interaction to Next Paint reported by the browser",
		unit: "ms",
	});
	webVitalClsHistogram = meter.createHistogram("web.vital.cls", {
		description: "Cumulative Layout Shift reported by the browser",
		unit: "1",
	});
}

function initializeLogPipeline(
	resource: ReturnType<typeof resourceFromAttributes>,
	collectorUrl: string,
) {
	const loggerProvider = new LoggerProvider({
		resource,
		processors: [
			new BatchLogRecordProcessor(
				new OTLPLogExporter({
					url: joinOtlpLogUrl(collectorUrl),
				}),
			),
		],
	});

	logs.setGlobalLoggerProvider(loggerProvider);
}

function getWebVitalAttributes(metric: Metric) {
	return {
		"url.path": normalizePagePath(window.location.pathname),
		"web.vital.rating": metric.rating,
		"web.vital.navigation_type": metric.navigationType,
	};
}

function recordWebVital(metric: Metric) {
	const attributes = getWebVitalAttributes(metric);

	if (metric.name === "TTFB") {
		webVitalTtfbHistogram?.record(metric.value, attributes);
		return;
	}

	if (metric.name === "FCP") {
		webVitalFcpHistogram?.record(metric.value, attributes);
		return;
	}

	if (metric.name === "LCP") {
		webVitalLcpHistogram?.record(metric.value, attributes);
		return;
	}

	if (metric.name === "INP") {
		webVitalInpHistogram?.record(metric.value, attributes);
		return;
	}

	if (metric.name === "CLS") {
		webVitalClsHistogram?.record(metric.value, attributes);
	}
}

function registerWebVitalsMetrics() {
	onTTFB(recordWebVital);
	onFCP(recordWebVital);
	onLCP(recordWebVital);
	onINP(recordWebVital);
	onCLS(recordWebVital);
}

function initializeOtel() {
	if (!settings.otel.enabled) return;

	if (!settings.otel.collectorUrl) {
		console.warn(
			"[otel] VITE_OTEL_EXPORTER_OTLP_ENDPOINT is required when VITE_OTEL_ENABLED=true; telemetry was not initialized.",
		);
		return;
	}

	const resource = resourceFromAttributes(getBrowserResourceAttributes());
	const collectorUrl = settings.otel.collectorUrl;

	initializeTracePipeline(resource, collectorUrl);
	initializeMetricPipeline(resource, collectorUrl);
	initializeLogPipeline(resource, collectorUrl);
	registerWebVitalsMetrics();
	initLogHandler();
}

initializeOtel();
