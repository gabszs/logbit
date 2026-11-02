import {
	SpanKind,
	SpanStatusCode,
	context,
	diag,
	propagation,
	trace,
} from "@opentelemetry/api";
import {
	InstrumentationBase,
	isWrapped,
} from "@opentelemetry/instrumentation";
import {
	ATTR_ERROR_TYPE,
	ATTR_HTTP_REQUEST_METHOD,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_SERVER_ADDRESS,
	ATTR_SERVER_PORT,
	ATTR_URL_FULL,
	ATTR_URL_PATH,
	ATTR_URL_QUERY,
	ATTR_URL_SCHEME,
} from "@opentelemetry/semantic-conventions";
import type { FetchInstrumentationConfig } from "./types";

const PACKAGE_NAME = "@loglog/bun-instrumentation-fetch";
const PACKAGE_VERSION = "0.1.0";
const WRAP_SYMBOL = Symbol("opentelemetry.bun-fetch.wrapped");

const DEFAULT_IGNORE_PATTERNS = [
	/:4318(\/|$)/,
	/:4317(\/|$)/,
	/\/v1\/traces/,
	/\/v1\/metrics/,
	/\/v1\/logs/,
];

function sanitizeUrl(url: URL): string {
	if (!url.password) {
		return url.toString();
	}
	const clone = new URL(url.toString());
	clone.password = "REDACTED";
	return clone.toString();
}

declare const Bun: { fetch?: typeof globalThis.fetch } | undefined;

export class BunFetchInstrumentation extends InstrumentationBase {
	private _originalFetch?: typeof globalThis.fetch;
	private _originalBunFetch?: typeof globalThis.fetch;

	constructor(config: FetchInstrumentationConfig = {}) {
		super(PACKAGE_NAME, PACKAGE_VERSION, config);
	}

	protected init() {
		this._patchFetch();
		return [];
	}

	enable() {
		this._patchFetch();
	}

	disable() {
		this._unpatchFetch();
	}

	private _shouldIgnore(urlString: string): boolean {
		const config = this._config as FetchInstrumentationConfig;
		const ignoreUrls = config.ignoreUrls || DEFAULT_IGNORE_PATTERNS;

		return ignoreUrls.some((pattern) => {
			if (typeof pattern === "string") {
				return urlString.includes(pattern);
			}
			if (pattern instanceof RegExp) {
				return pattern.test(urlString);
			}
			return false;
		});
	}

	private _patchFetch() {
		if (typeof globalThis.fetch !== "function" || (globalThis.fetch as any)[WRAP_SYMBOL]) {
			return;
		}

		this._originalFetch = globalThis.fetch;
		if (typeof Bun !== "undefined" && typeof Bun.fetch === "function") {
			this._originalBunFetch = Bun.fetch;
		}

		const self = this;
		const originalFetch = this._originalFetch;

		const wrappedFetch = async function (
			input: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> {
			const config = self._config as FetchInstrumentationConfig;
			const hasNoParentSpan = trace.getSpan(context.active()) === undefined;

			if (config.requireParentSpan && hasNoParentSpan) {
				return originalFetch.call(globalThis, input, init);
			}

			let targetUrl: URL;
			let method = "GET";
			const outgoingHeaders = new Headers();

			try {
				if (input instanceof Request) {
					targetUrl = new URL(input.url);
					method = input.method || "GET";
					input.headers.forEach((v, k) => outgoingHeaders.set(k, v));
				} else if (input instanceof URL) {
					targetUrl = input;
					method = init?.method || "GET";
				} else {
					const strInput = String(input);
					// If relative path, resolve against base; otherwise standard URL constructor
					targetUrl = strInput.startsWith("/")
						? new URL(strInput, "http://localhost")
						: new URL(strInput);
					method = init?.method || "GET";
				}

				if (init?.headers) {
					const initHeaders = new Headers(init.headers);
					initHeaders.forEach((v, k) => outgoingHeaders.set(k, v));
				}
			} catch (parseErr: any) {
				// If URL parsing fails, create span, record error, and call originalFetch (which will reject with TypeError)
				const span = self.tracer.startSpan(`HTTP ${method.toUpperCase()}`, {
					kind: SpanKind.CLIENT,
					attributes: {
						[ATTR_HTTP_REQUEST_METHOD]: method.toUpperCase(),
						[ATTR_ERROR_TYPE]: parseErr.name || "TypeError",
					},
				});
				span.recordException(parseErr);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: parseErr.message,
				});
				span.end();
				return originalFetch.call(globalThis, input, init);
			}

			if (self._shouldIgnore(targetUrl.toString())) {
				return originalFetch.call(globalThis, input, init);
			}

			const sanitizedUrlString = sanitizeUrl(targetUrl);
			const spanName = `${method.toUpperCase()} ${targetUrl.pathname || "/"}`;
			const span = self.tracer.startSpan(spanName, {
				kind: SpanKind.CLIENT,
				attributes: {
					[ATTR_HTTP_REQUEST_METHOD]: method.toUpperCase(),
					[ATTR_URL_FULL]: sanitizedUrlString,
					[ATTR_URL_SCHEME]: targetUrl.protocol.replace(":", ""),
					[ATTR_URL_PATH]: targetUrl.pathname,
					...(targetUrl.search ? { [ATTR_URL_QUERY]: targetUrl.search.slice(1) } : {}),
					[ATTR_SERVER_ADDRESS]: targetUrl.hostname,
					[ATTR_SERVER_PORT]:
						Number(targetUrl.port) ||
						(targetUrl.protocol === "https:" ? 443 : 80),
				},
			});

			return context.with(trace.setSpan(context.active(), span), async () => {
				propagation.inject(context.active(), outgoingHeaders, {
					set: (carrier, key, value) => carrier.set(key, String(value)),
				});

				let finalInput: RequestInfo | URL;
				let finalInit = init
					? { ...init, headers: outgoingHeaders }
					: { headers: outgoingHeaders };

				if (input instanceof Request) {
					finalInput = new Request(input, finalInit);
				} else {
					finalInput = input;
				}

				try {
					const response = await originalFetch.call(globalThis, finalInput, finalInit);
					span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);

					if (response.status >= 400) {
						span.setAttribute(ATTR_ERROR_TYPE, String(response.status));
						span.setStatus({
							code: SpanStatusCode.ERROR,
							message: `HTTP ${response.status}`,
						});
					} else {
						span.setStatus({ code: SpanStatusCode.OK });
					}

					if (config.applyCustomAttributesOnSpan) {
						try {
							config.applyCustomAttributesOnSpan(span, input, response);
						} catch (e) {
							diag.error("Error in fetch custom attribute hook", e);
						}
					}

					return response;
				} catch (err: any) {
					span.recordException(err);
					span.setAttribute(ATTR_ERROR_TYPE, err.name || "Error");
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: err.message,
					});
					throw err;
				} finally {
					span.end();
				}
			});
		};

		(wrappedFetch as any)[WRAP_SYMBOL] = true;
		(wrappedFetch as any)._original = originalFetch;
		Object.assign(wrappedFetch, originalFetch);

		try {
			(globalThis as any).fetch = wrappedFetch;
			if (typeof Bun !== "undefined" && Bun) {
				(Bun as any).fetch = wrappedFetch;
			}
		} catch (e) {
			diag.error("Failed to patch fetch:", e);
		}
	}

	private _unpatchFetch() {
		if (this._originalFetch && (globalThis.fetch as any)?.[WRAP_SYMBOL]) {
			globalThis.fetch = this._originalFetch;
		}
		if (this._originalBunFetch && typeof Bun !== "undefined" && Bun) {
			(Bun as any).fetch = this._originalBunFetch;
		}
	}
}
