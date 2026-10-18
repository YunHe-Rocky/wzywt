import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { redis, warnRedisFailure } from "./redis";
import { requestContext } from "./request-context";

// Only data reads are cached. Identity, permissions, workflow state and all
// transaction reads remain authoritative MySQL reads.
const models = new Set(["Hero", "Equipment", "RolePreference", "HeroPower", "Announcement"]);
const reads = new Set(["findUnique", "findFirst", "findMany", "count", "aggregate", "groupBy"]);
export const redisNamespace = `wzywt:query:v1:${createHash("sha256").update(process.env.DATABASE_URL || "unconfigured").digest("hex").slice(0, 20)}`;
const namespace = redisNamespace;
const epochKey = `${namespace}:epoch`;
const TTL = 30;
type Encoded = null | string | number | boolean | { type: string; value: unknown };

export function encodeCacheValue(value: unknown): Encoded {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (value instanceof Date) return { type: "date", value: value.toISOString() };
  if (typeof value === "bigint") return { type: "bigint", value: String(value) };
  if (Prisma.Decimal.isDecimal(value)) return { type: "decimal", value: String(value) };
  if (Array.isArray(value)) return { type: "array", value: value.map(encodeCacheValue) };
  if (value && typeof value === "object") return { type: "object", value: Object.entries(value).map(([key, item]) => [key, encodeCacheValue(item)]) };
  throw new TypeError("Unsupported cache value");
}

export function decodeCacheValue(value: Encoded): unknown {
  if (value === null || typeof value !== "object") return value;
  switch (value.type) {
    case "date": return new Date(String(value.value));
    case "bigint": return BigInt(String(value.value));
    case "decimal": return new Prisma.Decimal(String(value.value));
    case "array": return (value.value as Encoded[]).map(decodeCacheValue);
    case "object": return Object.fromEntries((value.value as [string, Encoded][]).map(([key, item]) => [key, decodeCacheValue(item)]));
    default: throw new TypeError("Invalid cache value");
  }
}

export function canCacheQuery(params: { model?: string; action: string; runInTransaction?: boolean }, method?: string): boolean {
  return method === "GET" && !params.runInTransaction && models.has(params.model || "") && reads.has(params.action);
}

async function epoch(): Promise<string> {
  const current = await redis!.get(epochKey);
  if (current) return current;
  const created = randomUUID();
  await redis!.set(epochKey, created, "NX");
  return await redis!.get(epochKey) || created;
}

export async function invalidateQueryCache(): Promise<void> {
  if (!redis) return;
  try { await redis.set(epochKey, randomUUID()); }
  catch (error) { warnRedisFailure("query-invalidate", error); }
}

/** Epoch keys prevent a slow pre-write read from repopulating the new cache. */
export async function readThroughQuery<T>(identity: string, load: () => Promise<T>): Promise<T> {
  if (!redis) return load();
  let key: string;
  try {
    key = `${namespace}:${await epoch()}:${createHash("sha256").update(identity).digest("hex")}`;
    const cached = await redis.get(key);
    if (cached !== null) return decodeCacheValue(JSON.parse(cached)) as T;
  } catch (error) { warnRedisFailure("query-read", error); return load(); }
  const result = await load();
  try {
    const payload = JSON.stringify(encodeCacheValue(result));
    if (Buffer.byteLength(payload) <= 1024 * 1024) await redis.set(key, payload, "EX", TTL);
  } catch (error) { warnRedisFailure("query-fill", error); }
  return result;
}

export const queryCacheMiddleware: Prisma.Middleware = async (params, next) => {
  if (!canCacheQuery(params, requestContext.getStore()?.method)) return next(params);
  return readThroughQuery(JSON.stringify([params.model, params.action, params.args]), () => next(params));
};

// Every business API uses Redis for a shared concurrency lease before entering
// the use case; health must remain reachable to diagnose Redis failures.
export async function acquireRedisRequest(requestId: string, lane: string, limit: number): Promise<(() => Promise<void>) | null> {
  if (!redis) {
    if (process.env.REDIS_REQUIRED === "1") throw new Error("REDIS_REQUIRED");
    return async () => {};
  }
  const key = `${namespace}:requests:${lane}`;
  try {
    const now = Date.now();
    const admitted = await redis.eval(`
      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
      if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
      redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
      redis.call('PEXPIRE', KEYS[1], 120000)
      return 1`, 1, key, now, now + 90_000, limit, requestId);
    if (Number(admitted) !== 1) return null;
    const timer = setInterval(() => {
      void redis!.eval("if redis.call('ZSCORE',KEYS[1],ARGV[1]) then redis.call('ZADD',KEYS[1],ARGV[2],ARGV[1]);redis.call('PEXPIRE',KEYS[1],120000) end;return 1", 1,
        key, requestId, Date.now() + 90_000).catch(error => warnRedisFailure("request-renew", error));
    }, 30_000);
    timer.unref();
    return async () => { clearInterval(timer); try { await redis!.zrem(key, requestId); } catch (error) { warnRedisFailure("request-release", error); } };
  } catch (error) {
    warnRedisFailure("request-admission", error);
    if (process.env.REDIS_REQUIRED === "1") throw new Error("REDIS_REQUIRED");
    return async () => {};
  }
}
