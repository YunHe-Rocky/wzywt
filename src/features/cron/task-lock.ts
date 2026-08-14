import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { redis, warnRedisFailure } from "@/lib/redis";

const runningTasks = new Set<string>();
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;
const DB_LOCK_PREFIX = "cron:db-lock:";

interface DatabaseLease {
  token: string;
  expiresAt: number;
}

function parseLease(value: string): DatabaseLease | null {
  try {
    const parsed = JSON.parse(value) as Partial<DatabaseLease>;
    return typeof parsed.token === "string" && Number.isSafeInteger(parsed.expiresAt)
      ? parsed as DatabaseLease
      : null;
  } catch {
    return null;
  }
}

async function acquireDatabaseLock(name: string, token: string, ttlMs: number): Promise<boolean> {
  const key = `${DB_LOCK_PREFIX}${name}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await prisma.kvCache.findUnique({ where: { key } });
    const lease = row ? parseLease(row.value) : null;
    if (row && lease && lease.expiresAt > Date.now()) return false;
    const value = JSON.stringify({ token, expiresAt: Date.now() + ttlMs } satisfies DatabaseLease);
    if (row) {
      const updated = await prisma.kvCache.updateMany({
        where: { key, value: row.value },
        data: { value },
      });
      if (updated.count === 1) return true;
      continue;
    }
    try {
      await prisma.kvCache.create({ data: { key, value } });
      return true;
    } catch (error) {
      const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!collision) throw error;
    }
  }
  return false;
}

async function releaseDatabaseLock(name: string, token: string): Promise<void> {
  const key = `${DB_LOCK_PREFIX}${name}`;
  const row = await prisma.kvCache.findUnique({ where: { key } });
  if (!row || parseLease(row.value)?.token !== token) return;
  await prisma.kvCache.deleteMany({ where: { key, value: row.value } });
}

async function renewDatabaseLock(name: string, token: string, ttlMs: number): Promise<boolean> {
  const key = `${DB_LOCK_PREFIX}${name}`;
  const row = await prisma.kvCache.findUnique({ where: { key } });
  if (!row || parseLease(row.value)?.token !== token) return false;
  const value = JSON.stringify({ token, expiresAt: Date.now() + ttlMs } satisfies DatabaseLease);
  const updated = await prisma.kvCache.updateMany({
    where: { key, value: row.value },
    data: { value },
  });
  return updated.count === 1;
}

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
  let databaseLockAcquired = false;
  let databaseRenewalTimer: ReturnType<typeof setInterval> | null = null;
  let databaseRenewalInFlight: Promise<void> = Promise.resolve();
  let databaseRenewalPending = false;
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

    // The database lease remains canonical even while Redis is healthy, so a
    // Redis recovery cannot overlap a task that started during an outage.
    databaseLockAcquired = await acquireDatabaseLock(name, token, ttlMs);
    if (!databaseLockAcquired) {
      console.warn(`[cron:${name}] skipped because another process owns the database lease`);
      return false;
    }
    const renewalIntervalMs = Math.max(1_000, Math.min(60_000, Math.floor(ttlMs / 3)));
    databaseRenewalTimer = setInterval(() => {
      if (databaseRenewalPending) return;
      databaseRenewalPending = true;
      databaseRenewalInFlight = (async () => {
        const renewed = await renewDatabaseLock(name, token, ttlMs);
        if (!renewed) {
          console.error(`[cron:${name}] lost the database lease while running`);
          if (databaseRenewalTimer) clearInterval(databaseRenewalTimer);
        }
      })().catch((error: unknown) => {
        console.error(`[cron:${name}] database lease renewal failed`, error instanceof Error ? error.message : error);
      }).finally(() => {
        databaseRenewalPending = false;
      });
    }, renewalIntervalMs);

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
    if (databaseLockAcquired) {
      if (databaseRenewalTimer) clearInterval(databaseRenewalTimer);
      await databaseRenewalInFlight;
      try {
        await releaseDatabaseLock(name, token);
      } catch (error) {
        console.warn(`[cron:${name}] database lease cleanup failed`, error instanceof Error ? error.message : error);
      }
    }
    runningTasks.delete(name);
  }
}
