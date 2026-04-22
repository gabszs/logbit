import { RedisClient } from "bun";
import type { Env, Input } from "hono";
import type {
	ClientRateLimitInfo,
	HonoConfigType,
	Store,
} from "hono-rate-limiter";
import { type Settings, settings } from "@/env";

export const createRedisClient = (
	runtimeSettings: Pick<Settings, "REDIS_URL">,
) => {
	return new RedisClient(runtimeSettings.REDIS_URL);
};

export const redis = createRedisClient(settings);

const INCREMENT_SCRIPT = `
  local hits = redis.call("INCR", KEYS[1])
  if hits == 1 or ARGV[2] == "1" then
    redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[1]))
  end
  local pttl = redis.call("PTTL", KEYS[1])
  return { hits, pttl }
`;

const GET_SCRIPT = `
  local hits = redis.call("GET", KEYS[1])
  if hits == false then
    return nil
  end
  local pttl = redis.call("PTTL", KEYS[1])
  return { hits, pttl }
`;

export class BunRedisStore<
	E extends Env = Env,
	P extends string = string,
	I extends Input = Input,
> implements Store<E, P, I>
{
	windowMs = 0;
	prefix: string;
	private resetExpiryOnChange: boolean;
	private redisClient: RedisClient;

	constructor(
		prefix = "hrl:",
		resetExpiryOnChange = false,
		redisClient: RedisClient = redis,
	) {
		this.prefix = prefix;
		this.resetExpiryOnChange = resetExpiryOnChange;
		this.redisClient = redisClient;
	}

	init(options: HonoConfigType<E, P, I>) {
		this.windowMs = options.windowMs;
	}

	private key(k: string) {
		return `${this.prefix}${k}`;
	}

	async get(key: string): Promise<ClientRateLimitInfo | undefined> {
		const result = (await this.redisClient.send("EVAL", [
			GET_SCRIPT,
			"1",
			this.key(key),
		])) as [string, number] | null;

		if (result === null) return undefined;

		return {
			totalHits: Number(result[0]),
			resetTime: new Date(Date.now() + result[1]),
		};
	}

	async increment(key: string): Promise<ClientRateLimitInfo> {
		const result = (await this.redisClient.send("EVAL", [
			INCREMENT_SCRIPT,
			"1",
			this.key(key),
			this.windowMs.toString(),
			this.resetExpiryOnChange ? "1" : "0",
		])) as [number, number];

		return {
			totalHits: result[0],
			resetTime: new Date(Date.now() + result[1]),
		};
	}

	async decrement(key: string): Promise<void> {
		await this.redisClient.decr(this.key(key));
	}

	async resetKey(key: string): Promise<void> {
		await this.redisClient.del(this.key(key));
	}
}
