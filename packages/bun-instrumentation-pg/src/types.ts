import { Span } from "@opentelemetry/api";
import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface PgInstrumentationConfig extends InstrumentationConfig {
	/**
	 * Hook that allows adding custom span attributes based on the query result.
	 */
	responseHook?: (span: Span, response: any) => void;

	/**
	 * Whether to require a parent span to create a new span.
	 * @default false
	 */
	requireParentSpan?: boolean;

	/**
	 * Whether to ignore connect spans.
	 * @default false
	 */
	ignoreConnectSpans?: boolean;
}
