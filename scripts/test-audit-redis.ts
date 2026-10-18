import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  const url = new URL(process.env.REDIS_URL || "redis://invalid/");
  if (process.env.ALLOW_REDIS_INTEGRATION_TEST !== "1" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/15") throw new Error("Redis regression requires an explicitly approved loopback Redis DB 15");
  // Unique namespace; no FLUSHDB or shared-key deletion.
  process.env.DATABASE_URL = `mysql://test:test@127.0.0.1:3306/redis_${randomUUID().replaceAll("-", "")}_test`;
  process.env.REDIS_REQUIRED = "1";
  const { redis } = await import("../src/lib/redis");
  const { acquireRedisRequest, readThroughQuery, invalidateQueryCache, redisNamespace } = await import("../src/lib/redis-query-cache");
  assert.ok(redis);
  try {
    const slots = await Promise.all(Array.from({ length: 20 }, () => acquireRedisRequest(randomUUID(), "integration", 3)));
    const admitted = slots.filter((value): value is () => Promise<void> => value !== null);
    assert.equal(admitted.length, 3);
    await Promise.all(admitted.map(release => release()));
    const next = await acquireRedisRequest(randomUUID(), "integration", 3); assert.ok(next); await next();
    let loads = 0;
    await readThroughQuery("sample", async () => ++loads);
    assert.equal(await readThroughQuery("sample", async () => ++loads), 1); assert.equal(loads, 1);
    await invalidateQueryCache(); assert.equal(await readThroughQuery("sample", async () => ++loads), 2);
    console.log("Live Redis regression passed: atomic admission, release, read-through hit and post-write generation");
  } finally {
    let cursor = "0";
    do { const [next, keys] = await redis.scan(cursor, "MATCH", `${redisNamespace}:*`, "COUNT", 100); cursor = next; if (keys.length) await redis.del(...keys); } while (cursor !== "0");
    redis.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
