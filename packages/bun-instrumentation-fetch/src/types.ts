import type { Span } from "@opentelemetry/api";
import type { InstrumentationConfig } from "@opentelemetry/instrumentation";

export type FetchCustomAttributeFunction = (
	span: Span,
	request: RequestInfo | URL,
	response?: Response,
) => void;

export interface FetchInstrumentationConfig extends InstrumentationConfig {
	/**
	 * Function for adding custom attributes on response
	 */
	applyCustomAttributesOnSpan?: FetchCustomAttributeFunction;

	/**
	 * URLs to ignore from tracing (e.g. otel collector endpoints)
	 */
	ignoreUrls?: Array<string | RegExp>;

	/**
	 * Require parent span to create a client span. Default: false
	 */
	requireParentSpan?: boolean;
}
