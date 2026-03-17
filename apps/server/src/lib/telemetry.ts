import os from "node:os";
import {
	isSpanContextValid,
	context as otelContext,
	trace,
} from "@opentelemetry/api";
import type { MiddlewareHandler, Next } from "hono";
import { createMiddleware } from "hono/factory";
import pino from "pino";
import { UAParser } from "ua-parser-js";
import { settings } from "@/env";
import type { AppContext } from "../types";
import { buildOtelQueryAttributeMap } from "./telemetry";

const otelTransport = pino.transport({
	target: "pino-opentelemetry-transport",
	options: {
		serviceName: settings.OTEL_SERVICE_NAME,
		serviceVersion: "3.0.0",
		logLevel: settings.OTEL_LOG_LEVEL,
		loggerName: "pino-opentelemetry-transport",
		resourceAttributes: {
			"os.type": os.type(),
			"os.version": os.release(),
		},
	},
});

const consoleTransport = pino.transport({
	targets: [
		{
			target: "pino-opentelemetry-transport",
			options: {
				serviceName: settings.OTEL_SERVICE_NAME,
				serviceVersion: "3.0.0",
				logLevel: settings.OTEL_LOG_LEVEL,
				loggerName: "pino-opentelemetry-transport",
				resourceAttributes: {
					"os.type": os.type(),
					"os.version": os.release(),
				},
			},
		},
		{
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:standard",
				ignore: "pid,hostname,trace_id,span_id,trace_flags",
			},
		},
	],
});

function otelMixin() {
	const span = trace.getSpan(otelContext.active());

	if (!span) return {};

	const spanContext = span.spanContext();

	if (!isSpanContextValid(spanContext)) return {};

	return {
		trace_id: spanContext.traceId,
		span_id: spanContext.spanId,
		trace_flags: `0${spanContext.traceFlags.toString(16)}`, // "01"
	};
}

const pinoOptions: pino.LoggerOptions = {
	mixin: otelMixin,
	mixinMergeStrategy(mergeObject, mixinObject) {
		return { ...mergeObject, ...mixinObject };
	},
};

export const logger = pino(pinoOptions, otelTransport);
export const consoleLogger = pino(pinoOptions, consoleTransport);

interface InjectOtelTraceHeaderOptions {
	headerName?: string;
}

export const injectOtelTraceHeader = (
	options: InjectOtelTraceHeaderOptions = {},
): MiddlewareHandler => {
	const { headerName = settings.OTEL_TRACE_HEADER_NAME } = options;
	return async (c, next) => {
		await next();
		const traceId = trace.getActiveSpan()?.spanContext().traceId;
		if (traceId) {
			c.header(headerName, traceId);
		}
	};
};

export function InstrumentClass(): ClassDecorator {
	return (target: Function) => {
		let currentProto = target.prototype;

		// Percorre a árvore de herança
		while (currentProto && currentProto !== Object.prototype) {
			const propertyNames = Object.getOwnPropertyNames(currentProto);

			for (const propertyName of propertyNames) {
				// 1. Pula o constructor
				// 2. SÓ decora se for função
				// 3. EVITA decorar métodos internos do Drizzle/Helpers (importante!)
				if (
					propertyName === "constructor" ||
					typeof currentProto[propertyName] !== "function" ||
					propertyName.startsWith("apply") || // Ignora applyFilters, applySearchOptions
					propertyName.startsWith("_") // Ignora métodos privados por convenção
				) {
					continue;
				}

				const descriptor = Object.getOwnPropertyDescriptor(
					currentProto,
					propertyName,
				);
				if (!descriptor || descriptor.get || descriptor.set) continue;

				const originalMethod = descriptor.value;

				// Verifica se já não decoramos este método (evita duplicidade na herança)
				if (originalMethod.__isInstrumented) continue;

				const instrumentedMethod = function (this: any, ...args: any[]) {
					const tracer = trace.getTracer("default");
					const spanName = `${target.name}.${propertyName}`;

					return tracer.startActiveSpan(spanName, (span) => {
						try {
							const result = originalMethod.apply(this, args);

							if (result instanceof Promise) {
								return result
									.then((value) => {
										span.end();
										return value;
									})
									.catch((err) => {
										span.recordException(err);
										span.setStatus({ code: 2 });
										span.end();
										throw err;
									});
							}

							span.end();
							return result;
						} catch (err) {
							span.recordException(err as Error);
							span.setStatus({ code: 2 });
							span.end();
							throw err;
						}
					});
				};

				// Marca como instrumentado e substitui
				(instrumentedMethod as any).__isInstrumented = true;
				Object.defineProperty(currentProto, propertyName, {
					...descriptor,
					value: instrumentedMethod,
				});
			}

			currentProto = Object.getPrototypeOf(currentProto);
		}
	};
}

export function buildOtelQueryAttributeMap(
	queryParams: QueryParams,
	options?: {
		denylist?: string[];
		prefix?: string;
		maxParams?: number;
	},
): Record<string, string> {
	const { denylist = [], prefix = "url.query", maxParams = 20 } = options ?? {};

	return Object.fromEntries(
		Object.entries(queryParams)
			.filter(([, value]) => value !== undefined)
			.filter(([key]) => !denylist.includes(key.toLowerCase()))
			.slice(0, maxParams)
			.map(([key, value]) => [
				`${prefix}.${key}`,
				Array.isArray(value) ? value.join(",") : String(value),
			]),
	);
}

interface TraceIdMiddlewareOptions {
	headerName?: string;
}

function buildUserAgentAttributes(userAgent: string | undefined) {
	if (!userAgent) return {};

	const ua = new UAParser(userAgent).getResult();
	return {
		"user_agent.original": userAgent,
		"user_agent.device.model": ua.device.model,
		"user_agent.device.type": ua.device.type,
		"user_agent.device.vendor": ua.device.vendor,
		"user_agent.os": ua.os.name,
		"user_agent.os.version": ua.os.version,
		"user_agent.browser": ua.browser.name,
		"user_agent.browser_version": ua.browser.version,
		"user_agent.browser_major": ua.browser.major,
		"user_agent.browser.type": ua.browser.type,
		"user_agent.cpu.architecture": ua.cpu.architecture,
		"user_agent.engine": ua.engine.name,
		"user_agent.engine.version": ua.engine.version,
	};
}

function buildServiceAttributes(c: AppContext) {
	return {
		"service.environment": c.env.ENVIRONMENT,
		"deployment.environment": c.env.ENVIRONMENT,
		"service.team": "gabrielcarvalho",
		"service.owner": "gabrielcarvalho",
		"service.version": c.env.SERVICE_VERSION,
		"service.discord": "kali9849",
		"service.build.git_hash": c.env.commitHash,
		"service.build.git_branch": c.env.commitBranch,
		"service.build.deployment.user": c.env.deploymentUser,
		// "service.build.deployment.email": c.env.deploymentEmail,
		"service.build.deployment.trigger": c.env.deploymentTrigger,
		"service.build.deployment.id": c.env.VERSION_METADATA.id,
		"service.build.deployment.timestamp": c.env.VERSION_METADATA.timestamp,
	};
}

function buildClientGeoAttributes(cf: Record<string, unknown> | undefined) {
	if (!cf) return {};
	return {
		// Geo location
		"client.geo.country.iso_code": cf.country,
		"client.geo.continent.code": cf.continent,
		"client.geo.region.iso_code": cf.regionCode,
		"client.geo.locality.name": cf.city,
		"client.geo.postal_code": cf.postalCode,
		"client.geo.location.lat": cf.latitude,
		"client.geo.location.lon": cf.longitude,
		// Network/Cloud
		"cloud.availability_zone": cf.colo,
		"http.flavor": cf.httpProtocol,
		"network.tls.protocol.version": cf.tlsVersion,
		"network.tls.cipher": cf.tlsCipher,
	};
}

function buildBrowserAttributes(c: AppContext) {
	const secChUa = c.req.header("sec-ch-ua");
	const secChUaMobile = c.req.header("sec-ch-ua-mobile");
	const secChUaPlatform = c.req.header("sec-ch-ua-platform");

	return {
		"browser.brands": secChUa,
		"browser.mobile": secChUaMobile === "?1",
		"browser.platform": secChUaPlatform?.replace(/"/g, ""),
	};
}

async function extractErrorAttributes(response: Response) {
	const clonedResponse = response.clone();
	const body = (await clonedResponse.json()) as {
		error?: string;
		message?: string;
		code?: string;
	};
	return {
		"error.status": body.status,
		"error.message": body.message,
		"error.code": body.code,
		outcome: "error",
	};
}

export const otelConfig = (options: TraceIdMiddlewareOptions = {}) =>
	createMiddleware(async (c: AppContext, next: Next) => {
		const { headerName = "otel-trace-id" } = options;
		const startTime = Date.now();
		const span = trace.getSpan(otelContext.active());
		const traceId = span?.spanContext().traceId;

		const client_address = c.req.header("cf-connecting-ip");
		const userAgent = c.req.header("user-agent");

		// Extrai o body se existir
		let requestBody: unknown;
		try {
			requestBody = await c.req.json();
		} catch {
			// Não há body ou não é JSON
		}

		const event: Record<string, unknown> = {
			...buildServiceAttributes(c),
			...buildClientGeoAttributes(c.req.raw.cf),
			...buildUserAgentAttributes(userAgent),
			...buildBrowserAttributes(c),
			"http.request.id": c.req.header("cf-ray"),
			"deployment.id": c.env.VERSION_METADATA.id,
			timestamp: new Date(startTime).toISOString(),
			"client.address": client_address,
			...(requestBody !== undefined && { "http.request.body": requestBody }),
		};

		c.set("wideEvent", event);

		if (span) {
			span.setAttribute("client.address", client_address);
			span.setAttributes(buildOtelQueryAttributeMap(c.req.query()));
		}

		await next();

		const status_code = c.res.status;
		const isError = status_code >= 400;
		const isRateLimit = status_code === 429;
		const isJsonError =
			isError &&
			!isRateLimit &&
			c.res.headers.get("content-type")?.includes("application/json");

		event["http.response.status_code"] = status_code;
		event["duration_ms"] = Date.now() - startTime;
		event["ratelimit.triggered"] = isRateLimit;

		if (isJsonError) {
			// Object.assign(event, await extractErrorAttributes(c.res));
			event["outcome"] = "error";
		} else {
			event["outcome"] = "success";
		}

		// if (span && traceId) {
		// span.addEvent("wideEvent", event);
		// span.setAttributes(event);
		// if (isError) {
		// 	span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status_code}` });
		// } else {
		// 	span.setStatus({ code: SpanStatusCode.OK });
		// }
		// }
		span.setAttributes(event);
		c.res.headers.set(headerName, traceId);
	});
