import { settings } from "@/env";
import type { Attributes } from "@opentelemetry/api";
import { context as otelContext, trace } from "@opentelemetry/api";
import type { LogAttributes } from "@opentelemetry/api-logs";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { Context as HonoContext, Next } from "hono";
import { createMiddleware } from "hono/factory";
import pino from "pino";
import { UAParser } from "ua-parser-js";

const consoleLogger = pino(
	{},
	pino.transport({
		targets: [
			{
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "SYS:standard",
				},
			},
		],
	}),
);

type LogOptions = {
	attributes?: LogAttributes;
	severity?: SeverityNumber;
	printConsole?: boolean;
};

function serializeLogBody(body: unknown): string {
	if (typeof body === "string") {
		return body;
	}

	if (body instanceof Error) {
		return body.stack ?? body.message;
	}

	const serialized = safeJsonStringify(body);
	return serialized ?? String(body);
}

function createLogger(name: string, version?: string) {
	const otelLogger = logs.getLogger(name, version);

	function emit(
		severityNumber: SeverityNumber,
		severityText: string,
		body: unknown,
		{ attributes, severity, printConsole }: LogOptions = {},
	) {
		const serializedBody = serializeLogBody(body);

		otelLogger.emit({
			severityNumber: severity ?? severityNumber,
			severityText,
			body: serializedBody,
			...(attributes ? { attributes } : {}),
		});

		if (printConsole) {
			const level = severityText.toLowerCase() as pino.Level;
			if (body instanceof Error) {
				consoleLogger[level](
					{ ...(attributes ?? {}), err: body },
					body.message,
				);
				return;
			}

			consoleLogger[level](attributes ?? {}, serializedBody);
		}
	}

	return {
		trace: (body: unknown, options?: LogOptions) =>
			emit(SeverityNumber.TRACE, "TRACE", body, options),

		debug: (body: unknown, options?: LogOptions) =>
			emit(SeverityNumber.DEBUG, "DEBUG", body, options),

		info: (body: unknown, options?: LogOptions) =>
			emit(SeverityNumber.INFO, "INFO", body, options),

		warn: (body: unknown, options?: LogOptions) =>
			emit(SeverityNumber.WARN, "WARN", body, options),

		error: (body: unknown, options?: LogOptions) =>
			emit(SeverityNumber.ERROR, "ERROR", body, options),

		fatal: (body: unknown, options?: LogOptions) =>
			emit(SeverityNumber.FATAL, "FATAL", body, options),
	};
}

export const logger = createLogger("loglog.api", "1.0.0");

function normalizeAttributes(obj: Record<string, unknown>): Attributes {
	return Object.fromEntries(
		Object.entries(obj).map(([key, value]) => {
			if (
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean"
			) {
				return [key, value];
			}

			if (value == null) return [key, undefined];

			if (Array.isArray(value)) {
				return [key, value.map((v) => String(v)).join(",")];
			}

			return [key, safeJsonStringify(value)];
		}),
	);
}

function safeJsonStringify(value: unknown, maxLength = 2000) {
	try {
		const str = JSON.stringify(value);
		if (!str) return undefined;
		return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
	} catch {
		return undefined;
	}
}

export const injectOtelTraceHeader = createMiddleware(async (c, next) => {
	const headerName = settings.OTEL_TRACE_HEADER_NAME;
	const traceId = trace.getActiveSpan()?.spanContext().traceId;

	if (traceId) {
		c.header(headerName, traceId);
	}

	await next();
});

type ClassMethod = ((...args: unknown[]) => unknown) & {
	__isInstrumented?: boolean;
};

export function InstrumentClass(): ClassDecorator {
	// biome-ignore lint/complexity/noBannedTypes: ClassDecorator requires Function
	return (target: Function) => {
		let currentProto = target.prototype as Record<string, unknown>;

		while (currentProto && currentProto !== Object.prototype) {
			for (const propertyName of Object.getOwnPropertyNames(currentProto)) {
				if (
					propertyName === "constructor" ||
					typeof currentProto[propertyName] !== "function" ||
					propertyName.startsWith("_") ||
					propertyName.startsWith("apply")
				) {
					continue;
				}

				const descriptor = Object.getOwnPropertyDescriptor(
					currentProto,
					propertyName,
				);

				if (!descriptor || descriptor.get || descriptor.set) continue;

				const originalMethod = descriptor.value as ClassMethod;
				if (originalMethod.__isInstrumented) continue;

				const instrumented = function (
					this: object,
					...args: unknown[]
				): unknown {
					const tracer = trace.getTracer("default");
					const spanName = `${target.name}.${propertyName}`;

					return tracer.startActiveSpan(spanName, (span) => {
						try {
							const result = originalMethod.apply(this, args);

							if (result instanceof Promise) {
								return result
									.then((res) => {
										span.end();
										return res;
									})
									.catch((err: unknown) => {
										span.recordException(err as Error);
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
				} as ClassMethod;

				instrumented.__isInstrumented = true;

				Object.defineProperty(currentProto, propertyName, {
					...descriptor,
					value: instrumented,
				});
			}

			currentProto = Object.getPrototypeOf(currentProto) as Record<
				string,
				unknown
			>;
		}
	};
}

function getClientAddress(c: HonoContext) {
	return (
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
		c.req.header("x-real-ip") ||
		c.req.header("x-client-ip")
	);
}

function buildUserAgentAttributes(userAgent?: string) {
	if (!userAgent) return {};

	const ua = new UAParser(userAgent).getResult();

	return {
		"user_agent.original": userAgent,
		"user_agent.os": ua.os.name,
		"user_agent.os.version": ua.os.version,
		"user_agent.browser": ua.browser.name,
		"user_agent.browser_version": ua.browser.version,
	};
}

function buildBrowserAttributes(c: HonoContext) {
	return {
		"browser.brands": c.req.header("sec-ch-ua"),
		"browser.mobile": c.req.header("sec-ch-ua-mobile") === "?1",
		"browser.platform": c.req.header("sec-ch-ua-platform")?.replace(/"/g, ""),
	};
}

function buildServiceAttributes(c: HonoContext) {
	return {
		"service.environment": c.env.ENVIRONMENT,
		"service.version": c.env.SERVICE_VERSION,
		"service.build.git_hash": c.env.commitHash,
		"service.build.git_branch": c.env.commitBranch,
		"deployment.id": c.env.VERSION_METADATA?.id,
		"deployment.timestamp": c.env.VERSION_METADATA?.timestamp,
	};
}

// function buildQueryAttributes(query: Record<string, string | string[]>) {
// 	return Object.fromEntries(
// 		Object.entries(query).map(([k, v]) => [
// 			`url.query.${k}`,
// 			Array.isArray(v) ? v.join(",") : v,
// 		]),
// 	);
// }

export const otelConfig = () =>
	createMiddleware(async (c: HonoContext, next: Next) => {
		const start = Date.now();

		const span = trace.getSpan(otelContext.active());
		const traceId = span?.spanContext().traceId;

		const userAgent = c.req.header("user-agent");
		const clientAddress = getClientAddress(c);

		let body: unknown;
		try {
			if (c.req.header("content-type")?.includes("application/json")) {
				body = await c.req.json();
			}
		} catch {}

		const rawEvent = {
			...buildServiceAttributes(c),
			...buildUserAgentAttributes(userAgent),
			...buildBrowserAttributes(c),

			"http.request.id": c.req.header("x-request-id") || traceId,
			"client.address": clientAddress,
			timestamp: new Date(start).toISOString(),

			...(body != null && {
				"http.request.body": safeJsonStringify(body),
			}),
		};

		const event = normalizeAttributes(rawEvent);
		c.set("wideEvent", event);

		await next();
		const status = c.res.status;
		event["http.response.status_code"] = status;
		event.duration_ms = Date.now() - start;
		event.outcome = status >= 400 ? "error" : "success";
		event["ratelimit.triggered"] = status === 429;

		if (span) {
			span.setAttributes(event);
		}
	});
