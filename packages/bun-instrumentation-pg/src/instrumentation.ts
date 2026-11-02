import {
	type Attributes,
	context,
	diag,
	type Span,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import {
	InstrumentationBase,
	InstrumentationNodeModuleDefinition,
	isWrapped,
} from "@opentelemetry/instrumentation";
import type {
	BunModuleExports,
	BunSQLConstructor,
	BunSQLInstance,
	PgInstrumentationConfig,
} from "./types";
import {
	ATTR_DB_OPERATION_NAME,
	ATTR_DB_QUERY_TEXT,
	ATTR_ERROR_TYPE,
	extractDatabaseName,
	getClientAttributes,
	parseNormalizedOperationName,
} from "./utils";

const PACKAGE_NAME = "@loglog/bun-instrumentation-pg";
const PACKAGE_VERSION = "0.1.0";

declare const Bun: { SQL: BunSQLConstructor } | undefined;

const WRAP_SYMBOL: unique symbol = Symbol("opentelemetry.bun-pg.wrapped");

type WrappedMethod = (...args: unknown[]) => unknown;

type WrappedConstructor = ((...args: unknown[]) => unknown) & {
	[WRAP_SYMBOL]: boolean;
	_original: BunSQLConstructor;
	prototype: object;
};

type SQLParent = Record<
	string,
	BunSQLConstructor | WrappedConstructor | undefined
>;

export class BunPgInstrumentation extends InstrumentationBase {
	private _methodCache = new WeakMap<object, Map<string, WrappedMethod>>();

	constructor(config: PgInstrumentationConfig = {}) {
		super(PACKAGE_NAME, PACKAGE_VERSION, config);
	}

	protected init() {
		// Direct patch for Bun's global SQL if available
		if (Bun?.SQL) {
			diag.debug("Bun.SQL found globally, patching...");
			this._patchSQL(Bun as unknown as SQLParent, "SQL");
		}

		return [
			new InstrumentationNodeModuleDefinition(
				"bun",
				["*"],
				(moduleExports: BunModuleExports) => {
					if (moduleExports?.SQL) {
						diag.debug("SQL found in bun module exports, patching...");
						this._patchSQL(moduleExports as unknown as SQLParent, "SQL");
					}
					return moduleExports;
				},
				(moduleExports: BunModuleExports) => {
					if (moduleExports?.SQL) {
						this._unpatchSQL(moduleExports as unknown as SQLParent, "SQL");
					}
				},
			),
		];
	}

	private _patchSQL(parent: SQLParent, key: string) {
		if (isWrapped(parent[key])) {
			return;
		}

		const originalSQL = parent[key] as BunSQLConstructor;

		const self = this;
		// biome-ignore lint/complexity/useArrowFunction: must be a regular function to support `new SQL()`
		const wrapFn = function (...args: unknown[]) {
			const instance = Reflect.construct(originalSQL, args) as BunSQLInstance;
			return self._wrapSqlInstance(instance);
		};
		const wrappedSQL: WrappedConstructor = Object.assign(wrapFn, {
			[WRAP_SYMBOL]: true as const,
			_original: originalSQL,
			prototype: originalSQL.prototype,
		});

		// Copy static properties and prototype from originalSQL
		Object.defineProperties(
			wrappedSQL,
			Object.getOwnPropertyDescriptors(originalSQL),
		);

		try {
			parent[key] = wrappedSQL;
		} catch (e) {
			diag.error(`Failed to patch ${key}:`, e);
		}
	}

	private _unpatchSQL(parent: SQLParent, key: string) {
		const current = parent[key] as WrappedConstructor | undefined;
		if (current?.[WRAP_SYMBOL]) {
			try {
				parent[key] = current._original;
			} catch (e) {
				diag.error(`Failed to unpatch ${key}:`, e);
			}
		}
	}

	private _startPgSpan(
		instance: BunSQLInstance,
		operation?: string,
		queryText?: string,
	): Span {
		const dbName = extractDatabaseName(instance.options);
		const baseName = operation || "query";
		const spanName = dbName ? `${baseName} ${dbName}` : baseName;

		const attributes: Attributes = {
			...getClientAttributes(instance),
		};

		if (operation) {
			attributes[ATTR_DB_OPERATION_NAME] = operation;
		}

		if (queryText) {
			attributes[ATTR_DB_QUERY_TEXT] = queryText;
		}

		return this.tracer.startSpan(spanName, {
			kind: SpanKind.CLIENT,
			attributes,
		});
	}

	private _wrapSqlInstance(instance: BunSQLInstance): BunSQLInstance {
		const instrumentation = this;
		const originalInstance = instance as BunSQLInstance &
			Record<symbol, unknown>;

		// Prevent double wrapping
		if (originalInstance[WRAP_SYMBOL]) {
			return originalInstance;
		}

		return new Proxy(originalInstance, {
			apply(target, _thisArg, argArray) {
				return instrumentation._handleQuery(target, argArray);
			},
			get(target, prop, receiver) {
				const value = Reflect.get(target, prop, receiver) as unknown;
				if (typeof value === "function" && typeof prop === "string") {
					// Don't patch Promise methods or internal symbols
					if (prop === "then" || prop === "catch" || prop === "finally") {
						return (value as WrappedMethod).bind(target);
					}

					// Use cache for patched methods
					let instanceCache = instrumentation._methodCache.get(target);
					if (!instanceCache) {
						instanceCache = new Map();
						instrumentation._methodCache.set(target, instanceCache);
					}

					let patchedMethod = instanceCache.get(prop);
					if (!patchedMethod) {
						patchedMethod = instrumentation._patchMethod(
							prop,
							value as WrappedMethod,
							target,
						);
						instanceCache.set(prop, patchedMethod);
					}

					return patchedMethod;
				}
				return value;
			},
		}) as BunSQLInstance;
	}

	private _patchMethod(
		name: string,
		original: WrappedMethod,
		instance: BunSQLInstance,
	): WrappedMethod {
		return (...args: unknown[]) => {
			const config = this._config as PgInstrumentationConfig;
			const hasNoParentSpan = trace.getSpan(context.active()) === undefined;

			if (config.requireParentSpan && hasNoParentSpan) {
				return original.apply(instance, args);
			}

			// 'close' usually doesn't need a span unless specified.
			if (name === "close") {
				return original.apply(instance, args);
			}

			// Extract query text for specific methods
			let queryText: string | undefined;
			let operationName: string | undefined = name;

			if (name === "unsafe" && typeof args[0] === "string") {
				queryText = args[0];
				operationName = parseNormalizedOperationName(args[0]);
			} else if (name === "begin") {
				queryText = "BEGIN";
				operationName = "BEGIN";
			} else if (name === "commit") {
				queryText = "COMMIT";
				operationName = "COMMIT";
			} else if (name === "rollback") {
				queryText = "ROLLBACK";
				operationName = "ROLLBACK";
			}

			const span = this._startPgSpan(instance, operationName, queryText);

			if (name === "transaction" && typeof args[0] === "function") {
				const originalCallback = args[0] as (tx: BunSQLInstance) => unknown;
				args[0] = (tx: BunSQLInstance) => {
					const wrappedTx = this._wrapSqlInstance(tx);
					return originalCallback.call(undefined, wrappedTx);
				};
			}

			return context.with(trace.setSpan(context.active(), span), () => {
				try {
					const result = original.apply(instance, args);
					if (
						result !== null &&
						typeof result === "object" &&
						"then" in result
					) {
						return this._wrapQuery(result as PromiseLike<unknown>, span);
					}
					// For methods like 'begin' that return a new SQL instance synchronously
					if (name === "begin" && result && typeof result === "function") {
						return this._wrapSqlInstance(result as BunSQLInstance);
					}
					span.end();
					return result;
				} catch (e) {
					const err = e as Error;
					span.recordException(err);
					span.setAttribute(ATTR_ERROR_TYPE, err.name || "Error");
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: err.message,
					});
					span.end();
					throw e;
				}
			});
		};
	}

	private _handleQuery(
		originalInstance: BunSQLInstance,
		args: unknown[],
	): unknown {
		const config = this._config as PgInstrumentationConfig;
		const hasNoParentSpan = trace.getSpan(context.active()) === undefined;

		if (config.requireParentSpan && hasNoParentSpan) {
			return (originalInstance as unknown as WrappedMethod).apply(
				originalInstance,
				args,
			);
		}

		// Detect query or configuration call
		const isTaggedTemplate =
			Array.isArray(args[0]) && (args[0] as { raw?: unknown }).raw !== undefined;
		const isStringQuery = typeof args[0] === "string";

		// If called with options (not a query), wrap and return the scoped instance
		if (!isTaggedTemplate && !isStringQuery) {
			const result = (originalInstance as unknown as WrappedMethod).apply(
				originalInstance,
				args,
			);
			if (result && (typeof result === "function" || typeof result === "object")) {
				return this._wrapSqlInstance(result as BunSQLInstance);
			}
			return result;
		}

		let queryText: string | undefined;
		if (isTaggedTemplate) {
			const strings = args[0] as string[];
			queryText = strings.join("?");
		} else if (isStringQuery) {
			queryText = args[0] as string;
		}

		const operation = queryText
			? parseNormalizedOperationName(queryText)
			: undefined;

		const span = this._startPgSpan(originalInstance, operation, queryText);

		return context.with(trace.setSpan(context.active(), span), () => {
			try {
				const result = (originalInstance as unknown as WrappedMethod).apply(
					originalInstance,
					args,
				);

				// Bun SQL queries return a Promise-like object (DirectQuery/PostgresSQLQuery)
				if (result !== null && typeof result === "object" && "then" in result) {
					return this._wrapQuery(result as PromiseLike<unknown>, span);
				}

				span.end();
				return result;
			} catch (e) {
				const err = e as Error;
				span.recordException(err);
				span.setAttribute(ATTR_ERROR_TYPE, err.name || "Error");
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: err.message,
				});
				span.end();
				throw e;
			}
		});
	}

	private _wrapQuery(
		query: PromiseLike<unknown>,
		span: Span,
	): PromiseLike<unknown> {
		const config = this._config as PgInstrumentationConfig;
		let spanEnded = false;

		const endSpan = (err?: Error, res?: unknown) => {
			if (!spanEnded) {
				if (err) {
					span.recordException(err);
					span.setAttribute(ATTR_ERROR_TYPE, err.name || "Error");
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: err.message,
					});
				} else if (config.responseHook) {
					try {
						config.responseHook(span, res);
					} catch (e) {
						diag.error("Error in pg responseHook", e);
					}
				}
				span.end();
				spanEnded = true;
			}
		};

		return new Proxy(query, {
			get(target, prop, receiver) {
				const value = Reflect.get(target, prop, receiver) as unknown;
				if (typeof value === "function") {
					if (prop === "then") {
						return (
							onFulfilled?: (value: unknown) => unknown,
							onRejected?: (reason: unknown) => unknown,
						) => {
							return (value as PromiseLike<unknown>["then"]).call(
								target,
								(res: unknown) => {
									endSpan(undefined, res);
									return onFulfilled ? onFulfilled(res) : res;
								},
								(err: Error) => {
									endSpan(err);
									return onRejected ? onRejected(err) : Promise.reject(err);
								},
							);
						};
					}
					if (prop === "catch") {
						return (onRejected?: (reason: unknown) => unknown) => {
							return (value as WrappedMethod).call(target, (err: Error) => {
								endSpan(err);
								return onRejected ? onRejected(err) : Promise.reject(err);
							});
						};
					}
					if (prop === "finally") {
						return (onFinally?: () => void) => {
							return (value as WrappedMethod).call(target, () => {
								endSpan();
								return onFinally ? onFinally() : undefined;
							});
						};
					}
					// For other methods (like .values(), .expect(), etc.), wrap them to return the Proxy if they return the target
					return (...args: unknown[]) => {
						const result = (value as WrappedMethod).apply(target, args);
						if (result === target) {
							return receiver;
						}
						return result;
					};
				}
				return value;
			},
		});
	}
}
