import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

function createRedis(): Redis | null {
  if (!REDIS_URL) return null;
  try {
    const redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      connectTimeout: 5000,
      enableReadyCheck: true,
    });
    redis.on("error", () => {}); // silent fallback
    return redis;
  } catch {
    return null;
  }
}

export const redis = globalForRedis.redis ?? createRedis();
if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis!;

const TTL = 3600; // 1 hour default

function toKey(domain: string, id: string | number): string {
  return `${domain}:${id}`;
}

export async function cacheGet<T>(domain: string, id: string | number): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(toKey(domain, id));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(domain: string, id: string | number, data: unknown, ttl = TTL): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(toKey(domain, id), JSON.stringify(data), "EX", ttl);
  } catch { /* silent */ }
}

export async function cacheDel(domain: string, id: string | number): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(toKey(domain, id));
  } catch { /* silent */ }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* silent */ }
}

export async function cacheHGet(domain: string, id: string | number): Promise<Record<string, string> | null> {
  if (!redis) return null;
  try {
    const data = await redis.hgetall(toKey(domain, id));
    return Object.keys(data).length > 0 ? data : null;
  } catch {
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
  } catch { /* silent */ }
}
