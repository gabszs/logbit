import type { Counter } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import { logs } from "@opentelemetry/api-logs";
import {
	ATTR_EXCEPTION_MESSAGE,
	ATTR_EXCEPTION_TYPE,
} from "@opentelemetry/semantic-conventions";
import type { StackLineParser, StackLineParserFn } from "@sentry/core";
import { createStackParser } from "@sentry/core";
import { settings } from "@/web/lib/config";

// ─── types ────────────────────────────────────────────────────────────────────

export type ErrorSource =
	| "react-boundary"
	| "window-error"
	| "unhandled-rejection"
	| "resource-error"
	| "console-error";

type StackFrame = {
	filename?: string;
	lineno?: number;
	colno?: number;
	function?: string;
};

type ExceptionRecord = {
	type: string;
	message: string;
	stacktrace?: { frames: StackFrame[] };
	mechanism?: {
		type: string;
		handled: boolean;
		data?: Record<string, string>;
	};
};

// ─── module state ─────────────────────────────────────────────────────────────

let errorLogger: Logger | undefined;
let errorCounter: Counter | undefined;
const seenErrors = new WeakSet<object>();

// ─── resource elements that trigger capture-phase error events ────────────────

const RESOURCE_ELEMENTS = new Set([
	"IMG",
	"SCRIPT",
	"LINK",
	"IFRAME",
	"SOURCE",
	"VIDEO",
	"AUDIO",
	"TRACK",
]);

// ─── stack parser (V8/Chrome + Gecko/Firefox) via @sentry/core ───────────────

const v8LineFn: StackLineParserFn = (line) => {
	// Format: "    at fnName (file:line:col)" or "    at file:line:col"
	const match = /^\s*at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
	if (!match) return undefined;
	return {
		function: match[1] ?? "<anonymous>",
		filename: match[2],
		lineno: Number(match[3]),
		colno: Number(match[4]),
	};
};

const geckoLineFn: StackLineParserFn = (line) => {
	// Format: "fnName@file:line:col" or "@file:line:col"
	const match = /^(.*?)@(.+):(\d+):(\d+)$/.exec(line);
	if (!match) return undefined;
	return {
		function: match[1] || "<anonymous>",
		filename: match[2],
		lineno: Number(match[3]),
		colno: Number(match[4]),
	};
};

const v8LineParser: StackLineParser = [40, v8LineFn];
const geckoLineParser: StackLineParser = [50, geckoLineFn];
const parseStack = createStackParser(v8LineParser, geckoLineParser);

// ─── page id normalization ────────────────────────────────────────────────────

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const OPAQUE_ID_RE = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9_-]{12,}$/;

function isOpaqueId(segment: string) {
	return (
		UUID_RE.test(segment) ||
		ULID_RE.test(segment) ||
		OBJECT_ID_RE.test(segment) ||
		OPAQUE_ID_RE.test(segment)
	);
}

function normalizePagePath(pathname: string) {
	const normalized = pathname.replace(/\/+$/, "") || "/";

	if (/^\/settings\/invitations\/[^/]+$/.test(normalized)) {
		return "/settings/invitations/*";
	}

	const segments = normalized.split("/").filter(Boolean);
	if (segments.length === 0) return "/";
	return `/${segments.map((s) => (isOpaqueId(s) ? "*" : s)).join("/")}`;
}

// ─── sanitization ─────────────────────────────────────────────────────────────

function sanitizeMessage(value: string): string {
	return value
		.replace(/\bhttps?:\/\/[^\s"'<>]+/g, (match) => {
			try {
				const url = new URL(match);
				url.search = "";
				url.hash = "";
				return url.href;
			} catch {
				return match.replace(/\?[^#\s"'<>]*/g, "");
			}
		})
		.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer REDACTED")
		.replace(/\bBasic\s+[A-Za-z0-9._~+/=-]+/gi, "Basic REDACTED")
		.replace(
			/\b(token|access_token|refresh_token|api_key|apikey|password|secret|authorization)\b\s*[:=]\s*["']?[^"',\s&}]+/gi,
			(_m, key: string) => `${key}=REDACTED`,
		);
}

// ─── cause chain walker ───────────────────────────────────────────────────────

function extractExceptionRecord(
	err: Error,
	mechanismType: string,
	handled: boolean,
): ExceptionRecord {
	const frames = err.stack ? parseStack(err.stack, 1) : [];
	return {
		type: err.name || err.constructor.name || "Error",
		message: err.message || "",
		stacktrace: frames.length > 0 ? { frames } : undefined,
		mechanism: { type: mechanismType, handled },
	};
}

function walkCauseChain(
	err: Error,
	mechanismType: string,
	handled: boolean,
	depth = 0,
): ExceptionRecord[] {
	const records: ExceptionRecord[] = [
		extractExceptionRecord(err, mechanismType, handled),
	];

	if (depth < 5 && err.cause instanceof Error) {
		return [
			...walkCauseChain(err.cause, "chained", false, depth + 1),
			...records,
		];
	}

	return records;
}

// ─── router / normalizer ──────────────────────────────────────────────────────

function mechanismFor(
	source: ErrorSource,
): { type: string; handled: boolean } {
	switch (source) {
		case "window-error":
			return { type: "onerror", handled: false };
		case "unhandled-rejection":
			return { type: "unhandledrejection", handled: false };
		case "resource-error":
			return { type: "instrument", handled: false };
		case "console-error":
			return { type: "instrument", handled: true };
		case "react-boundary":
			return { type: "generic", handled: true };
	}
}

function normalizeToExceptions(
	source: ErrorSource,
	raw: unknown,
): ExceptionRecord[] | null {
	const mech = mechanismFor(source);

	if (raw instanceof Error) {
		return walkCauseChain(raw, mech.type, mech.handled);
	}

	if (raw instanceof ErrorEvent) {
		if (raw.error instanceof Error) {
			return walkCauseChain(raw.error, mech.type, mech.handled);
		}
		if (raw.message) {
			return [
				{
					type: "_OTHER",
					message: raw.message,
					mechanism: { type: mech.type, handled: mech.handled },
				},
			];
		}
		return null;
	}

	// Resource load failure (img, script, link, etc.)
	if (raw instanceof Event && !(raw instanceof ErrorEvent)) {
		const target = raw.target;
		if (!(target instanceof Element)) return null;
		const src =
			(target as HTMLImageElement | HTMLScriptElement).src ||
			(target as HTMLLinkElement).href ||
			target.getAttribute("src") ||
			target.getAttribute("href") ||
			"unknown";
		return [
			{
				type: "ResourceLoadError",
				message: `Failed to load ${target.tagName.toLowerCase()}: ${src}`,
				mechanism: {
					type: mech.type,
					handled: mech.handled,
					data: { target: target.tagName },
				},
			},
		];
	}

	if (typeof raw === "string" && raw) {
		return [
			{
				type: "_OTHER",
				message: raw,
				mechanism: { type: mech.type, handled: mech.handled },
			},
		];
	}

	if (Array.isArray(raw)) {
		const firstError = raw.find((a): a is Error => a instanceof Error);
		if (firstError) {
			return walkCauseChain(firstError, mech.type, mech.handled);
		}
		const message = raw
			.filter((a) => typeof a === "string")
			.join(" ")
			.trim();
		if (message) {
			return [
				{
					type: "_OTHER",
					message,
					mechanism: { type: mech.type, handled: mech.handled },
				},
			];
		}
	}

	return null;
}

// ─── deduplication ────────────────────────────────────────────────────────────

function isDuplicate(raw: unknown): boolean {
	if (raw !== null && typeof raw === "object") {
		if (seenErrors.has(raw)) return true;
		seenErrors.add(raw);
	}
	return false;
}

// ─── emit ─────────────────────────────────────────────────────────────────────

function emitErrorLog(
	exceptions: ExceptionRecord[],
	source: ErrorSource,
): void {
	if (!errorLogger && !errorCounter) return;

	const primary = exceptions.at(-1);
	const exceptionType = primary?.type ?? "_OTHER";
	const exceptionMessage = sanitizeMessage(primary?.message ?? "Unknown error");
	const body = exceptionMessage.split(/\r?\n/)[0] ?? "Unknown error";
	const escaped = !mechanismFor(source).handled;

	errorCounter?.add(1, {
		"exception.source": source,
		[ATTR_EXCEPTION_TYPE]: exceptionType,
	});

	errorLogger?.emit({
		severityNumber: 17,
		severityText: "ERROR",
		body,
		attributes: {
			"exception.source": source,
			[ATTR_EXCEPTION_TYPE]: exceptionType,
			...(exceptionMessage !== body
				? { [ATTR_EXCEPTION_MESSAGE]: exceptionMessage }
				: {}),
			"exception.escaped": escaped,
			"url.path": normalizePagePath(window.location.pathname),
			"exception.values": JSON.stringify(exceptions),
		},
	});
}

// ─── central handler ──────────────────────────────────────────────────────────

function handle(source: ErrorSource, raw: unknown): void {
	if (isDuplicate(raw)) return;
	const exceptions = normalizeToExceptions(source, raw);
	if (!exceptions || exceptions.length === 0) return;
	emitErrorLog(exceptions, source);
}

// ─── public api ───────────────────────────────────────────────────────────────

export function reportError(error: unknown, source: ErrorSource): void {
	handle(source, error);
}

export function initLogHandler(): void {
	errorLogger = logs.getLogger("loglog-web-errors");
	const meter = metrics.getMeter("loglog-web");
	errorCounter = meter.createCounter("loglog.frontend.error.count", {
		description: "Unhandled frontend errors observed by the browser",
	});

	// 1. JavaScript errors (window.onerror bubbling)
	window.addEventListener("error", (event) => {
		handle("window-error", event.error ?? event);
	});

	// 2. Unhandled promise rejections
	window.addEventListener("unhandledrejection", (event) => {
		handle("unhandled-rejection", event.reason);
	});

	// 3. Resource load failures — capture phase catches img/script/link errors
	//    that do not bubble to window
	document.documentElement.addEventListener(
		"error",
		(event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (!RESOURCE_ELEMENTS.has(target.tagName)) return;
			handle("resource-error", event);
		},
		{ capture: true },
	);

	// 4. console.error shim (opt-in via VITE_OTEL_CONSOLE_ERROR_ENABLED)
	if (settings.otel.consoleErrorEnabled) {
		const original = console.error.bind(console);
		console.error = (...args: unknown[]) => {
			original(...args);
			const firstError = args.find((a): a is Error => a instanceof Error);
			handle("console-error", firstError ?? args.join(" "));
		};
	}
}
