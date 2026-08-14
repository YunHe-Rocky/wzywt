export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  CRON_HEARTBEAT_KEY,
  CRON_HEARTBEAT_MAX_AGE_MS,
  parseCronHeartbeat,
} from "@/features/cron/heartbeat";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { getMediaStorage } from "@/lib/storage";
import { checkAvatarStorageHealth } from "@/features/profile/server/avatar-storage";

type CheckState = "ok" | "degraded" | "failed" | "skipped";
let databaseCheckInFlight: Promise<unknown> | null = null;
let redisCheckInFlight: Promise<unknown> | null = null;

function checkDatabase(): Promise<unknown> {
  if (databaseCheckInFlight) return databaseCheckInFlight;
  const operation = prisma.$queryRaw`SELECT 1`;
  const tracked = operation.finally(() => {
    if (databaseCheckInFlight === tracked) databaseCheckInFlight = null;
  });
  databaseCheckInFlight = tracked;
  return tracked;
}

function checkRedis(): Promise<unknown> {
  if (!redis) return Promise.reject(new Error("REDIS_CLIENT_UNAVAILABLE"));
  if (redisCheckInFlight) return redisCheckInFlight;
  const operation = redis.ping();
  const tracked = operation.finally(() => {
    if (redisCheckInFlight === tracked) redisCheckInFlight = null;
  });
  redisCheckInFlight = tracked;
  return tracked;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("HEALTH_CHECK_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const checks: Record<"database" | "mediaStorage" | "avatarStorage" | "cron" | "redis", CheckState> = {
    database: "failed",
    mediaStorage: "skipped",
    avatarStorage: "skipped",
    cron: "skipped",
    redis: "skipped",
  };
  const releaseId = process.env.APP_RELEASE_ID?.trim() || "development";
  let healthy = true;

  try {
    await withTimeout(checkDatabase(), 2_000);
    checks.database = "ok";
  } catch {
    healthy = false;
  }

  if (process.env.NODE_ENV === "production" || process.env.MEDIA_STORAGE_DIR?.trim()) {
    try {
      const storage = getMediaStorage();
      if (!storage.healthCheck) throw new Error("MEDIA_STORAGE_HEALTH_UNSUPPORTED");
      await withTimeout(storage.healthCheck(), 2_000);
      checks.mediaStorage = "ok";
    } catch {
      checks.mediaStorage = "failed";
      healthy = false;
    }
    try {
      await withTimeout(checkAvatarStorageHealth(), 2_000);
      checks.avatarStorage = "ok";
    } catch {
      checks.avatarStorage = "failed";
      healthy = false;
    }
  }

  if (process.env.APP_RELEASE_ID?.trim() && checks.database === "ok") {
    try {
      const row = await withTimeout(
        prisma.kvCache.findUnique({ where: { key: CRON_HEARTBEAT_KEY } }),
        2_000,
      );
      const heartbeat = row ? parseCronHeartbeat(row.value) : null;
      const fresh = heartbeat && Date.now() - heartbeat.timestamp <= CRON_HEARTBEAT_MAX_AGE_MS;
      if (!fresh || heartbeat.releaseId !== releaseId) throw new Error("CRON_HEARTBEAT_STALE");
      checks.cron = "ok";
    } catch {
      checks.cron = "failed";
      healthy = false;
    }
  }

  const redisConfigured = Boolean(process.env.REDIS_URL?.trim());
  const redisRequired = process.env.REDIS_REQUIRED === "1";
  if (redisConfigured) {
    try {
      await withTimeout(checkRedis(), 1_500);
      checks.redis = "ok";
    } catch {
      checks.redis = redisRequired ? "failed" : "degraded";
      if (redisRequired) healthy = false;
    }
  }

  return NextResponse.json(
    { ok: healthy, releaseId, checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
