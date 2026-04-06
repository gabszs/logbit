import type { Span } from "@opentelemetry/api";
import type { InstrumentationConfig } from "@opentelemetry/instrumentation";

/** Opções internas armazenadas na instância Bun.SQL (não expostas na API pública). */
export interface BunSQLOptions {
	database?: string;
	hostname?: string;
	port?: number;
	username?: string;
	url?: string;
}

/**
 * Interface mínima de uma instância Bun.SQL com o campo `options` acessível.
 * Define apenas o que a instrumentação precisa — sem depender de bun-types em tempo de compilação.
 */
export interface BunSQLInstance {
	readonly options?: BunSQLOptions;
}

/**
 * Construtor do Bun.SQL — mínimo necessário para acessar `prototype` no patching.
 */
export interface BunSQLConstructor {
	new (...args: unknown[]): BunSQLInstance;
	readonly prototype: object;
}

/** Módulo "bun" conforme exposto nos hooks do InstrumentationNodeModuleDefinition. */
export interface BunModuleExports {
	SQL?: BunSQLConstructor;
}

export type PgResponseHook = (span: Span, response: unknown) => void;

export interface PgInstrumentationConfig extends InstrumentationConfig {
	/**
	 * Hook que permite adicionar atributos customizados ao span com base na resposta da query.
	 */
	responseHook?: PgResponseHook;

	/**
	 * Se verdadeiro, exige um span pai para criar um novo span.
	 * @default false
	 */
	requireParentSpan?: boolean;

	/**
	 * Se verdadeiro, ignora spans de conexão.
	 * @default false
	 */
	ignoreConnectSpans?: boolean;
}
