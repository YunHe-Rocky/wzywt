import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { redis, warnRedisFailure } from "@/lib/redis";
import {
  assertTaskWriteAllowed,
  runWithTaskWriteFence,
  TaskWriteFenceError,
  type TaskWriteFence,
} from "@/lib/task-write-fence";

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

export interface ExclusiveTaskContext {
  readonly signal: AbortSignal;
  assertOwnership(): Promise<void>;
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

async function acquireDatabaseLock(name: string, token: string, ttlMs: number): Promise<number | null> {
  const key = `${DB_LOCK_PREFIX}${name}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await prisma.kvCache.findUnique({ where: { key } });
    const lease = row ? parseLease(row.value) : null;
    if (row && lease && lease.expiresAt > Date.now()) return null;
    const expiresAt = Date.now() + ttlMs;
    const value = JSON.stringify({ token, expiresAt } satisfies DatabaseLease);
    if (row) {
      const updated = await prisma.kvCache.updateMany({
        where: { key, value: row.value },
        data: { value },
      });
      if (updated.count === 1) return expiresAt;
      continue;
    }
    try {
      await prisma.kvCache.create({ data: { key, value } });
      return expiresAt;
    } catch (error) {
      const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!collision) throw error;
    }
  }
  return null;
}

async function releaseDatabaseLock(name: string, token: string): Promise<void> {
  const key = `${DB_LOCK_PREFIX}${name}`;
  const row = await prisma.kvCache.findUnique({ where: { key } });
  if (!row || parseLease(row.value)?.token !== token) return;
  await prisma.kvCache.deleteMany({ where: { key, value: row.value } });
}

async function renewDatabaseLock(name: string, token: string, ttlMs: number): Promise<number | null> {
  const key = `${DB_LOCK_PREFIX}${name}`;
  const row = await prisma.kvCache.findUnique({ where: { key } });
  if (!row || parseLease(row.value)?.token !== token) return null;
  const expiresAt = Date.now() + ttlMs;
  const value = JSON.stringify({ token, expiresAt } satisfies DatabaseLease);
  const updated = await prisma.kvCache.updateMany({
    where: { key, value: row.value },
    data: { value },
  });
  return updated.count === 1 ? expiresAt : null;
}

async function ownsDatabaseLock(name: string, token: string): Promise<boolean> {
  const row = await prisma.kvCache.findUnique({ where: { key: `${DB_LOCK_PREFIX}${name}` } });
  const lease = row ? parseLease(row.value) : null;
  return lease?.token === token && lease.expiresAt > Date.now();
}

export async function runExclusiveTask(
  name: string,
  ttlMs: number,
  operation: (context: ExclusiveTaskContext) => Promise<void>,
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

    const expiresAt = await acquireDatabaseLock(name, token, ttlMs);
    if (expiresAt === null) {
      console.warn(`[cron:${name}] skipped because another process owns the database lease`);
      return false;
    }
    databaseLockAcquired = true;
    const controller = new AbortController();
    const fence: TaskWriteFence = { name, token, expiresAt, signal: controller.signal };
    const markLeaseLost = (reason: string) => {
      if (!controller.signal.aborted) controller.abort(new TaskWriteFenceError(name, reason));
      if (databaseRenewalTimer) clearInterval(databaseRenewalTimer);
    };
    const context: ExclusiveTaskContext = {
      signal: controller.signal,
      async assertOwnership() {
        assertTaskWriteAllowed();
        if (!await ownsDatabaseLock(name, token)) {
          markLeaseLost("TASK_LEASE_OWNERSHIP_LOST");
          throw controller.signal.reason;
        }
      },
    };
    const renewalIntervalMs = Math.max(1_000, Math.min(60_000, Math.floor(ttlMs / 3)));
    databaseRenewalTimer = setInterval(() => {
      if (databaseRenewalPending) return;
      databaseRenewalPending = true;
      databaseRenewalInFlight = (async () => {
        const renewedUntil = await renewDatabaseLock(name, token, ttlMs);
        if (renewedUntil === null) {
          console.error(`[cron:${name}] lost the database lease while running`);
          markLeaseLost("TASK_LEASE_RENEWAL_REJECTED");
          return;
        }
        fence.expiresAt = renewedUntil;
      })().catch((error: unknown) => {
        console.error(`[cron:${name}] database lease renewal failed`, error instanceof Error ? error.message : error);
        markLeaseLost("TASK_LEASE_RENEWAL_FAILED");
      }).finally(() => {
        databaseRenewalPending = false;
      });
    }, renewalIntervalMs);
    databaseRenewalTimer.unref();

    await runWithTaskWriteFence(fence, async () => {
      await operation(context);
      await context.assertOwnership();
    });
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