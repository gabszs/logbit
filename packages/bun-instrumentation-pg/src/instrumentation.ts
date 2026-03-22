import {
	context,
	diag,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import {
	InstrumentationBase,
	InstrumentationNodeModuleDefinition,
	isWrapped,
} from "@opentelemetry/instrumentation";
import { PgInstrumentationConfig } from "./types";
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

declare const Bun: any;

const WRAP_SYMBOL = Symbol("opentelemetry.bun-pg.wrapped");

export class BunPgInstrumentation extends InstrumentationBase {
	constructor(config: PgInstrumentationConfig = {}) {
		super(PACKAGE_NAME, PACKAGE_VERSION, config);
	}

	protected init() {
		// Direct patch for Bun's global SQL if available
		if (typeof Bun !== "undefined" && Bun.SQL) {
			diag.debug("Bun.SQL found globally, patching...");
			this._patchSQL(Bun, "SQL");
		}

		return [
			new InstrumentationNodeModuleDefinition(
				"bun",
				["*"],
				(moduleExports: any) => {
					if (moduleExports && moduleExports.SQL) {
						diag.debug("SQL found in bun module exports, patching...");
						this._patchSQL(moduleExports, "SQL");
					}
					return moduleExports;
				},
				(moduleExports: any) => {
					if (moduleExports && moduleExports.SQL) {
						this._unpatchSQL(moduleExports, "SQL");
					}
				},
			),
		];
	}

	private _patchSQL(parent: any, key: string) {
		if (isWrapped(parent[key])) {
			return;
		}

		const instrumentation = this;
		const originalSQL = parent[key];

		const wrappedSQL = function (this: any, ...args: any[]) {
			// Bun.SQL can be called with or without 'new'
			const instance = Reflect.construct(originalSQL, args);
			return instrumentation._wrapSqlInstance(instance);
		};

		// Copy static properties
		Object.defineProperties(
			wrappedSQL,
			Object.getOwnPropertyDescriptors(originalSQL),
		);
		wrappedSQL.prototype = originalSQL.prototype;
		(wrappedSQL as any)[WRAP_SYMBOL] = true;
		(wrappedSQL as any)._original = originalSQL;

		try {
			parent[key] = wrappedSQL;
		} catch (e) {
			diag.error(`Failed to patch ${key}:`, e);
		}
	}

	private _unpatchSQL(parent: any, key: string) {
		if (parent[key] && (parent[key] as any)[WRAP_SYMBOL]) {
			try {
				parent[key] = (parent[key] as any)._original;
			} catch (e) {
				diag.error(`Failed to unpatch ${key}:`, e);
			}
		}
	}

	private _wrapSqlInstance(instance: any) {
		const instrumentation = this;
		const originalInstance = instance;

		return new Proxy(originalInstance, {
			apply(target, thisArg, argArray) {
				return instrumentation._handleQuery(target, argArray);
			},
			get(target, prop, receiver) {
				const value = Reflect.get(target, prop, receiver);
				if (typeof value === "function" && typeof prop === "string") {
					// Don't patch Promise methods or internal symbols
					if (prop === "then" || prop === "catch" || prop === "finally") {
						return value.bind(target);
					}
					return instrumentation._patchMethod(prop, value, target);
				}
				return value;
			},
		});
	}

	private _patchMethod(name: string, original: Function, instance: any) {
		const instrumentation = this;
		return function (this: any, ...args: any[]) {
			const config = instrumentation._config as PgInstrumentationConfig;
			const hasNoParentSpan = trace.getSpan(context.active()) === undefined;

			if (config.requireParentSpan && hasNoParentSpan) {
				return original.apply(instance, args);
			}

			// For methods like 'begin', 'transaction', we might want specific spans
			// but for now let's just trace them as generic PG operations if they are important.
			// 'close' usually doesn't need a span unless specified.
			if (name === "close") {
				return original.apply(instance, args);
			}

			// Extract query text for unsafe method
			let queryText = "UNKNOWN";
			let operationName = name;

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

			// Get database name for span name
			const dbName = extractDatabaseName(instance.options);
			const spanName = dbName ? `${operationName} ${dbName}` : operationName;

			const span = instrumentation.tracer.startSpan(spanName, {
				kind: SpanKind.CLIENT,
				attributes: {
					...getClientAttributes(instance),
					[ATTR_DB_OPERATION_NAME]: operationName,
					[ATTR_DB_QUERY_TEXT]: queryText,
				},
			});

			if (name === "transaction" && typeof args[0] === "function") {
				const originalCallback = args[0];
				args[0] = function (this: any, tx: any) {
					const wrappedTx = instrumentation._wrapSqlInstance(tx);
					return originalCallback.call(this, wrappedTx);
				};
			}

			return context.with(trace.setSpan(context.active(), span), () => {
				try {
					const result = original.apply(instance, args);
					if (result && typeof result.then === "function") {
						return instrumentation._wrapQuery(result, span);
					}
					// For methods like 'begin' that return a new SQL instance synchronously
					if (name === "begin" && result && typeof result === "function") {
						return instrumentation._wrapSqlInstance(result);
					}
					span.end();
					return result;
				} catch (e: any) {
					span.recordException(e);
					span.setAttribute(ATTR_ERROR_TYPE, e.name || "Error");
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: e.message,
					});
					span.end();
					throw e;
				}
			});
		};
	}

	private _handleQuery(originalInstance: any, args: any[]) {
		const instrumentation = this;
		const config = instrumentation._config as PgInstrumentationConfig;
		const hasNoParentSpan = trace.getSpan(context.active()) === undefined;

		if (config.requireParentSpan && hasNoParentSpan) {
			return originalInstance.apply(originalInstance, args);
		}

		// Detect if it's a tagged template call: args[0] is an array of strings
		let queryText = "UNKNOWN";
		if (Array.isArray(args[0]) && (args[0] as any).raw) {
			// Tagged template
			const strings = args[0] as string[];
			queryText = strings.join("?");
		} else if (typeof args[0] === "string") {
			queryText = args[0];
		}

		const operation = parseNormalizedOperationName(queryText);
		// Get database name for span name
		const dbName = extractDatabaseName(originalInstance.options);
		const spanName = dbName ? `${operation} ${dbName}` : operation;

		const span = instrumentation.tracer.startSpan(spanName, {
			kind: SpanKind.CLIENT,
			attributes: {
				...getClientAttributes(originalInstance),
				[ATTR_DB_OPERATION_NAME]: operation,
				[ATTR_DB_QUERY_TEXT]: queryText,
			},
		});

		return context.with(trace.setSpan(context.active(), span), () => {
			try {
				const result = originalInstance.apply(originalInstance, args);

				// Bun SQL queries return a Promise-like object (DirectQuery/PostgresSQLQuery)
				if (result && typeof result.then === "function") {
					return instrumentation._wrapQuery(result, span);
				}

				span.end();
				return result;
			} catch (e: any) {
				span.recordException(e);
				span.setAttribute(ATTR_ERROR_TYPE, e.name || "Error");
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: e.message,
				});
				span.end();
				throw e;
			}
		});
	}

	private _wrapQuery(query: any, span: any) {
		const instrumentation = this;
		const config = instrumentation._config as PgInstrumentationConfig;
		let spanEnded = false;

		const endSpan = (err?: any, res?: any) => {
			if (!spanEnded) {
				if (err) {
					span.recordException(err);
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
				const value = Reflect.get(target, prop, receiver);
				if (typeof value === "function") {
					if (prop === "then") {
						return (onFulfilled?: any, onRejected?: any) => {
							return value.call(
								target,
								(res: any) => {
									endSpan(null, res);
									return onFulfilled ? onFulfilled(res) : res;
								},
								(err: any) => {
									endSpan(err);
									return onRejected ? onRejected(err) : Promise.reject(err);
								},
							);
						};
					}
					if (prop === "catch") {
						return (onRejected?: any) => {
							return value.call(target, (err: any) => {
								endSpan(err);
								return onRejected ? onRejected(err) : Promise.reject(err);
							});
						};
					}
					if (prop === "finally") {
						return (onFinally?: any) => {
							return value.call(target, () => {
								endSpan();
								return onFinally ? onFinally() : undefined;
							});
						};
					}
					// For other methods (like .values(), .expect(), etc.), wrap them to return the Proxy if they return the target
					return function (this: any, ...args: any[]) {
						const result = value.apply(target, args);
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
