import type { Span } from "@opentelemetry/api";
import type { InstrumentationConfig } from "@opentelemetry/instrumentation";

export type DbStatementSerializer = (
	cmdName: string,
	cmdArgs: Array<string | Buffer | number>,
) => string;

export type RedisResponseCustomAttributeFunction = (
	span: Span,
	cmdName: string,
	cmdArgs: Array<string | Buffer | number>,
	response: unknown,
) => void;

export interface RedisInstrumentationConfig extends InstrumentationConfig {
	/** Custom serializer function for the db.statement tag */
	dbStatementSerializer?: DbStatementSerializer;

	/** Function for adding custom attributes on db response */
	responseHook?: RedisResponseCustomAttributeFunction;

	/** Require parent to create redis span, default when unset is false */
	requireParentSpan?: boolean;
}
