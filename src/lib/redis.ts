import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "";

const globalForRedis = globalThis as unknown as { redis?: Redis | null };
const lastWarningAt = new Map<string, number>();
const WARNING_INTERVAL_MS = 60_000;

export function redisRetryDelay(times: number): number {
  const exponent = Math.min(Math.max(times - 1, 0), 5);
  return Math.min(250 * (2 ** exponent), 5_000);
}

export function warnRedisFailure(operation: string, error: unknown): void {
  const now = Date.now();
  if (now - (lastWarningAt.get(operation) ?? 0) < WARNING_INTERVAL_MS) return;
  lastWarningAt.set(operation, now);
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[redis:${operation}] unavailable, using fallback: ${message}`);
}

function createRedis(): Redis | null {
  if (!REDIS_URL) return null;
  try {
    const redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: redisRetryDelay,
      connectTimeout: 5000,
      commandTimeout: 5000,
      enableReadyCheck: true,
      // The first real command starts the lazy connection and may wait for one
      // bounded retry. This avoids both build-time I/O and cold-start false failures.
      enableOfflineQueue: true,
      reconnectOnError(error) {
        return error.message.includes("READONLY") ? 2 : false;
      },
    });
    redis.on("error", (error) => warnRedisFailure("connection", error));
    return redis;
  } catch (error) {
    warnRedisFailure("create", error);
    return null;
  }
}

export const redis = globalForRedis.redis === undefined ? createRedis() : globalForRedis.redis;
globalForRedis.redis = redis;

const TTL = 3600; // 1 hour default

function toKey(domain: string, id: string | number): string {
  return `${domain}:${id}`;
}

export async function cacheGet<T>(domain: string, id: string | number): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(toKey(domain, id));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    warnRedisFailure("get", error);
    return null;
  }
}

export async function cacheSet(domain: string, id: string | number, data: unknown, ttl = TTL): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(toKey(domain, id), JSON.stringify(data), "EX", ttl);
  } catch (error) { warnRedisFailure("set", error); }
}

export async function cacheDel(domain: string, id: string | number): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(toKey(domain, id));
  } catch (error) { warnRedisFailure("del", error); }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (error) { warnRedisFailure("scan-delete", error); }
}

export async function cacheHGet(domain: string, id: string | number): Promise<Record<string, string> | null> {
  if (!redis) return null;
  try {
    const data = await redis.hgetall(toKey(domain, id));
    return Object.keys(data).length > 0 ? data : null;
  } catch (error) {
    warnRedisFailure("hget", error);
    return null;
  }
}

export async function cacheHSet(domain: string, id: string | number, data: Record<string, unknown>, ttl = TTL): Promise<void> {
  if (!redis) return;
  try {
    const key = toKey(domain, id);
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      flat[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
    await redis.hset(key, flat);
    await redis.expire(key, ttl);
  } catch (error) { warnRedisFailure("hset", error); }
}
