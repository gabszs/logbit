import { RedisClient } from "bun";
import type {
	ClientRateLimitInfo,
	HonoConfigType,
	Store,
} from "hono-rate-limiter";
import { settings } from "@/env";

export const redis = new RedisClient(settings.REDIS_URL);

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

export class BunRedisStore implements Store {
	windowMs = 0;

	constructor(
		private prefix = "hrl:",
		private resetExpiryOnChange = false,
	) {}

	init(options: HonoConfigType) {
		this.windowMs = options.windowMs;
	}

	private key(k: string) {
		return `${this.prefix}${k}`;
	}

	async get(key: string): Promise<ClientRateLimitInfo | null> {
		const result = (await redis.send("EVAL", [
			GET_SCRIPT,
			"1",
			this.key(key),
		])) as [string, number] | null;

		if (result === null) return null;

		return {
			totalHits: Number(result[0]),
			resetTime: new Date(Date.now() + result[1]),
		};
	}

	async increment(key: string): Promise<ClientRateLimitInfo> {
		const result = (await redis.send("EVAL", [
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
		await redis.decr(this.key(key));
	}

	async resetKey(key: string): Promise<void> {
		await redis.del(this.key(key));
	}
}
