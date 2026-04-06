import type { Span } from "@opentelemetry/api";
import type { InstrumentationConfig } from "@opentelemetry/instrumentation";

/** Opções internas que o Bun.RedisClient armazena na instância (não expostas na API pública). */
export interface BunRedisClientInternalOptions {
	db?: number;
	url?: string;
	socket?: {
		host?: string;
		port?: number;
	};
}

/**
 * Interface minimal do Bun.RedisClient com o campo `options` interno acessível.
 * Define apenas o que a instrumentação precisa — sem depender de bun-types em tempo de compilação.
 */
export interface BunRedisClientInstance {
	readonly options?: BunRedisClientInternalOptions;
}

/**
 * Construtor do Bun.RedisClient — mínimo necessário para acessar `prototype` no patching.
 */
export interface BunRedisClientConstructor {
	new (url?: string, options?: unknown): BunRedisClientInstance;
	readonly prototype: object;
}

/** Módulo "bun" conforme exposto nos hooks do InstrumentationNodeModuleDefinition. */
export interface BunModuleExports {
	RedisClient?: BunRedisClientConstructor;
}

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
