import { randomUUID } from "node:crypto";
import { redis, warnRedisFailure } from "@/lib/redis";

const runningTasks = new Set<string>();
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export async function runExclusiveTask(
  name: string,
  ttlMs: number,
  operation: () => Promise<void>,
): Promise<boolean> {
  if (runningTasks.has(name)) {
    console.warn(`[cron:${name}] skipped because the previous local run is still active`);
    return false;
  }

  runningTasks.add(name);
  const lockKey = `cron:lock:${name}`;
  const token = randomUUID();
  let distributedLockAcquired = false;
  try {
    if (redis) {
      try {
        distributedLockAcquired = (await redis.set(lockKey, token, "PX", ttlMs, "NX")) === "OK";
        if (!distributedLockAcquired) {
          console.warn(`[cron:${name}] skipped because another process owns the lock`);
          return false;
        }
      } catch (error) {
        warnRedisFailure(`lock:${name}`, error);
      }
    }

    await operation();
    return true;
  } finally {
    if (distributedLockAcquired && redis) {
      try {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
      } catch (error) {
        warnRedisFailure(`unlock:${name}`, error);
      }
    }
    runningTasks.delete(name);
  }
}
