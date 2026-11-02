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
} from "@opentelemetry/instrumentation";
import { defaultDbStatementSerializer } from "@opentelemetry/redis-common";
import {
	ATTR_DB_OPERATION_NAME,
	ATTR_DB_QUERY_TEXT,
} from "@opentelemetry/semantic-conventions";
import type {
	BunModuleExports,
	BunRedisClientConstructor,
	BunRedisClientInstance,
	BunRedisClientInternalOptions,
	RedisInstrumentationConfig,
} from "./types";
import { getClientAttributes } from "./utils";

const PACKAGE_NAME = "@loglog/bun-instrumentation-redis";
const PACKAGE_VERSION = "0.1.0";

const WRAP_SYMBOL = Symbol("opentelemetry.bun-redis.wrapped");

// bun-types declares Bun as a non-optional global namespace, but in non-Bun
// environments it won't exist. This local declaration shadows the global one
// to allow optional-chaining and reflect the true runtime possibility.
declare const Bun: { RedisClient: BunRedisClientConstructor } | undefined;

type MethodSlot = ((...args: unknown[]) => unknown) & {
	[WRAP_SYMBOL]?: boolean;
	_original?: (...args: unknown[]) => unknown;
};

// Semantic conventions for v1.40.0
const ATTR_ERROR_TYPE = "error.type";
const ATTR_DB_RESPONSE_STATUS_CODE = "db.response.status_code";
const ATTR_DB_STORED_PROCEDURE_NAME = "db.stored_procedure.name";

export class BunRedisInstrumentation extends InstrumentationBase {
	constructor(config: RedisInstrumentationConfig = {}) {
		super(PACKAGE_NAME, PACKAGE_VERSION, config);
	}

	protected init() {
		// Direct patch for Bun's global RedisClient if available
		if (Bun?.RedisClient) {
			diag.debug("Bun.RedisClient found globally, patching directly...");
			this._patchRedisClient(Bun.RedisClient);
			this._patchRedisConstructor(Bun as unknown as Record<string, unknown>);
		}

		return [
			new InstrumentationNodeModuleDefinition(
				"bun",
				["*"],
				(moduleExports: BunModuleExports) => {
					if (moduleExports?.RedisClient) {
						diag.debug("RedisClient found in module exports, patching...");
						this._patchRedisClient(moduleExports.RedisClient);
						this._patchRedisConstructor(
							moduleExports as unknown as Record<string, unknown>,
						);
					}
					return moduleExports;
				},
				(moduleExports: BunModuleExports) => {
					if (moduleExports?.RedisClient) {
						this._unpatchRedisClient(moduleExports.RedisClient);
					}
				},
			),
		];
	}

	private _patchRedisConstructor(parent: Record<string, unknown>): void {
		const original = parent.RedisClient as BunRedisClientConstructor;
		if (!original || (original as any)[WRAP_SYMBOL]) return;

		const wrapped = function (url?: string, options?: unknown) {
			const instance = Reflect.construct(original, [url, options]) as BunRedisClientInstance;
			let parsedOptions: BunRedisClientInternalOptions = {};
			if (typeof url === "string") {
				parsedOptions.url = url;
			} else if (typeof url === "object" && url !== null) {
				parsedOptions = { ...(url as any) };
			}
			if (typeof options === "object" && options !== null) {
				parsedOptions = { ...parsedOptions, ...(options as any) };
			}
			(instance as any)._otel_options = parsedOptions;
			return instance;
		};
		(wrapped as any)[WRAP_SYMBOL] = true;
		(wrapped as any)._original = original;
		Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(original));

		try {
			parent.RedisClient = wrapped;
		} catch (e) {
			diag.error("Failed to patch RedisClient constructor:", e);
		}
	}

	private _patchRedisClient(RedisClient: BunRedisClientConstructor): void {
		const proto = RedisClient.prototype as unknown as Record<
			string,
			MethodSlot
		>;

		// List of commands to patch, based on Bun's valkey.classes.ts
		const commands = [
			"get",
			"set",
			"del",
			"incr",
			"incrby",
			"incrbyfloat",
			"decr",
			"decrby",
			"exists",
			"expire",
			"expireat",
			"pexpire",
			"ttl",
			"hmset",
			"hset",
			"hsetnx",
			"hget",
			"hmget",
			"hdel",
			"hexists",
			"hrandfield",
			"hscan",
			"hgetdel",
			"hgetex",
			"hsetex",
			"hexpire",
			"hexpireat",
			"hexpiretime",
			"hpersist",
			"hpexpire",
			"hpexpireat",
			"hpexpiretime",
			"hpttl",
			"httl",
			"sismember",
			"sadd",
			"srem",
			"smembers",
			"srandmember",
			"spop",
			"hincrby",
			"hincrbyfloat",
			"bitcount",
			"blmove",
			"blmpop",
			"blpop",
			"brpop",
			"brpoplpush",
			"getbit",
			"setbit",
			"getrange",
			"setrange",
			"dump",
			"expiretime",
			"getdel",
			"getex",
			"hgetall",
			"hkeys",
			"hlen",
			"hvals",
			"keys",
			"lindex",
			"linsert",
			"llen",
			"lmove",
			"lmpop",
			"lpop",
			"lpos",
			"lrange",
			"lrem",
			"lset",
			"ltrim",
			"persist",
			"pexpireat",
			"pexpiretime",
			"pttl",
			"randomkey",
			"rpop",
			"rpoplpush",
			"scan",
			"scard",
			"sdiff",
			"sdiffstore",
			"sinter",
			"sintercard",
			"sinterstore",
			"smismember",
			"sscan",
			"strlen",
			"sunion",
			"sunionstore",
			"type",
			"zcard",
			"zcount",
			"zlexcount",
			"zpopmax",
			"zpopmin",
			"zrandmember",
			"zrange",
			"zrangebylex",
			"zrangebyscore",
			"zrangestore",
			"zrem",
			"zremrangebylex",
			"zremrangebyrank",
			"zremrangebyscore",
			"zrevrange",
			"zrevrangebylex",
			"zrevrangebyscore",
			"append",
			"getset",
			"lpush",
			"lpushx",
			"pfadd",
			"rpush",
			"rpushx",
			"setnx",
			"setex",
			"psetex",
			"zscore",
			"zincrby",
			"zmscore",
			"zadd",
			"zscan",
			"zdiff",
			"zdiffstore",
			"zinter",
			"zintercard",
			"zinterstore",
			"zunion",
			"zunionstore",
			"zmpop",
			"bzmpop",
			"bzpopmin",
			"bzpopmax",
			"mget",
			"mset",
			"msetnx",
			"ping",
			"publish",
			"script",
			"select",
			"spublish",
			"smove",
			"substr",
			"hstrlen",
			"zrank",
			"zrevrank",
			"subscribe",
			"psubscribe",
			"unsubscribe",
			"punsubscribe",
			"pubsub",
			"copy",
			"unlink",
			"touch",
			"rename",
			"renamenx",
			"send", // Generic send method
		];

		for (const command of commands) {
			if (typeof proto[command] === "function") {
				if (proto[command][WRAP_SYMBOL]) {
					continue;
				}
				const original = proto[command];
				const wrapped = this._patchCommand(command)(original) as MethodSlot;
				wrapped[WRAP_SYMBOL] = true;
				wrapped._original = original;

				try {
					// Since it's writable: true but configurable: false, we just assign it
					proto[command] = wrapped;
				} catch (e) {
					diag.error(`Failed to patch RedisClient.prototype.${command}:`, e);
				}
			}
		}
	}

	private _unpatchRedisClient(RedisClient: BunRedisClientConstructor): void {
		const proto = RedisClient.prototype as unknown as Record<
			string,
			MethodSlot
		>;
		for (const key in proto) {
			const slot = proto[key];
			if (slot?.[WRAP_SYMBOL] && slot._original) {
				try {
					proto[key] = slot._original;
				} catch (e) {
					diag.error(`Failed to unpatch RedisClient.prototype.${key}:`, e);
				}
			}
		}
	}

	private _patchCommand(commandName: string) {
		const instrumentation = this;
		return (original: (...args: unknown[]) => unknown) => {
			return function (this: BunRedisClientInstance, ...args: unknown[]) {
				const config = instrumentation._config as RedisInstrumentationConfig;
				const hasNoParentSpan = trace.getSpan(context.active()) === undefined;

				if (config.requireParentSpan && hasNoParentSpan) {
					return original.apply(this, args);
				}

				// Span name SHOULD follow the command name (e.g., "GET", "SET")
				const spanName = commandName.toUpperCase();
				const span = instrumentation.tracer.startSpan(spanName, {
					kind: SpanKind.CLIENT,
					attributes: {
						...getClientAttributes(this),
						[ATTR_DB_OPERATION_NAME]: spanName,
					},
				});

				// Handle Lua scripts (EVAL/EVALSHA)
				if (
					commandName.toLowerCase() === "eval" ||
					commandName.toLowerCase() === "evalsha"
				) {
					if (args.length > 0 && typeof args[0] === "string") {
						span.setAttribute(ATTR_DB_STORED_PROCEDURE_NAME, args[0]);
					}
				}

				const serializer =
					config.dbStatementSerializer || defaultDbStatementSerializer;
				try {
					const statement = serializer(
						commandName,
						args as Array<string | Buffer | number>,
					);
					if (statement) {
						span.setAttribute(ATTR_DB_QUERY_TEXT, statement);
					}
				} catch (e) {
					diag.error("Error serializing redis statement", e);
				}

				return context.with(trace.setSpan(context.active(), span), () => {
					const result = original.apply(this, args);

					if (result instanceof Promise) {
						return result.then(
							(res) => {
								if (config.responseHook) {
									try {
										config.responseHook(
											span,
											commandName,
											args as Array<string | Buffer | number>,
											res,
										);
									} catch (e) {
										diag.error("Error in redis responseHook", e);
									}
								}
								span.end();
								return res;
							},
							(err: Error) => {
								span.recordException(err);

								// error.type SHOULD match the canonical name of exception or status code
								span.setAttribute(ATTR_ERROR_TYPE, err.name || "Error");

								// Extract Redis error prefix if available (e.g., "ERR", "WRONGTYPE")
								if (err.message && typeof err.message === "string") {
									const match = err.message.match(/^([A-Z]+)\s/);
									if (match) {
										span.setAttribute(ATTR_DB_RESPONSE_STATUS_CODE, match[1]);
									}
								}

								span.setStatus({
									code: SpanStatusCode.ERROR,
									message: err.message,
								});
								span.end();
								throw err;
							},
						);
					}

					// If it's not a promise (unlikely for Bun Redis commands, but possible for some methods)
					span.end();
					return result;
				});
			};
		};
	}
}
