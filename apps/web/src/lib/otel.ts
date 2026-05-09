import { ZoneContextManager } from "@opentelemetry/context-zone";
import {
	CompositePropagator,
	W3CBaggagePropagator,
	W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import type { FetchCustomAttributeFunction } from "@opentelemetry/instrumentation-fetch";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
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
	ATTR_URL_QUERY,
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
import { settings } from "@/web/lib/config";

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

function joinOtlpTraceUrl(collectorUrl: string) {
	return `${collectorUrl.replace(/\/+$/, "")}/v1/traces`;
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

function getBrowserResourceAttributes() {
	const userAgent = navigator.userAgent;
	const mobile = isMobile(userAgent);
	const attributes = {
		[ATTR_SERVICE_NAME]: settings.otel.serviceName,
		[ATTR_USER_AGENT_ORIGINAL]: userAgent,
		"os.type": detectOs(userAgent),
		"os.name": navigator.platform,
		"device.type": mobile ? "mobile" : "desktop",
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
		url.href.startsWith(joinOtlpTraceUrl(settings.otel.collectorUrl))
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
	return request instanceof Request ? request.method : request.method;
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

	if (url.search) {
		span.setAttribute(ATTR_URL_QUERY, url.search.slice(1));
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
		span.setAttribute(ATTR_ERROR_TYPE, result.status?.toString() ?? "_OTHER");
		return;
	}

	span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, result.status);

	if (result.status >= 400) {
		span.setAttribute(ATTR_ERROR_TYPE, result.status.toString());
	}
};

function initializeOtel() {
	if (!settings.otel.enabled) return;

	if (!settings.otel.collectorUrl) {
		console.warn(
			"[otel] VITE_OTEL_EXPORTER_OTLP_ENDPOINT is required when VITE_OTEL_ENABLED=true; telemetry was not initialized.",
		);
		return;
	}

	const provider = new WebTracerProvider({
		resource: resourceFromAttributes(getBrowserResourceAttributes()),
		sampler: new ParentBasedSampler({
			root: new TraceIdRatioBasedSampler(settings.otel.sampleRatio),
		}),
		spanProcessors: [
			new BatchSpanProcessor(
				new OTLPTraceExporter({
					url: joinOtlpTraceUrl(settings.otel.collectorUrl),
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

initializeOtel();
