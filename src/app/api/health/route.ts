export const dynamic = "force-dynamic";

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  CRON_HEARTBEAT_KEY,
  CRON_HEARTBEAT_MAX_AGE_MS,
  parseCronHeartbeat,
} from "@/features/cron/heartbeat";
import { getMediaMinimumFreeBytes } from "@/features/media/server/quota";
import { checkAvatarStorageHealth } from "@/features/profile/server/avatar-storage";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { getMediaStorage } from "@/lib/storage";

type CheckState = "ok" | "degraded" | "failed" | "skipped";
type CheckName = "database" | "mediaStorage" | "avatarStorage" | "cron" | "redis";
const CHECK_TIMEOUT_MS = 1_800;

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

async function withTimeout<T>(operation: Promise<T>, timeoutMs = CHECK_TIMEOUT_MS): Promise<T> {
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

async function stateOf(operation: () => Promise<unknown>, failure: CheckState = "failed"): Promise<CheckState> {
  try {
    await withTimeout(operation());
    return "ok";
  } catch {
    return failure;
  }
}

function tokenMatches(request: NextRequest): boolean {
  const expected = process.env.HEALTH_DETAILS_TOKEN?.trim();
  const provided = request.headers.get("x-health-details-token")?.trim();
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET(request: NextRequest) {
  const releaseId = process.env.APP_RELEASE_ID?.trim() || "development";
  if (request.nextUrl.searchParams.get("mode") === "live") {
    return NextResponse.json(
      { ok: true, releaseId, mode: "liveness" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const mediaRequired = process.env.NODE_ENV === "production" || Boolean(process.env.MEDIA_STORAGE_DIR?.trim());
  const redisConfigured = Boolean(process.env.REDIS_URL?.trim());
  const redisRequired = process.env.REDIS_REQUIRED === "1";
  const minimumFreeBytes = getMediaMinimumFreeBytes();
  let mediaAvailableBytes: number | null = null;

  const databasePromise = stateOf(checkDatabase);
  const mediaPromise: Promise<CheckState> = mediaRequired ? stateOf(async () => {
    const storage = getMediaStorage();
    if (!storage.healthCheck) throw new Error("MEDIA_STORAGE_HEALTH_UNSUPPORTED");
    await storage.healthCheck();
    if (storage.availableBytes) {
      mediaAvailableBytes = await storage.availableBytes();
      if (mediaAvailableBytes < minimumFreeBytes) throw new Error("MEDIA_STORAGE_LOW_SPACE");
    }
  }) : Promise.resolve("skipped");
  const avatarPromise: Promise<CheckState> = mediaRequired
    ? stateOf(checkAvatarStorageHealth)
    : Promise.resolve("skipped");
  const cronPromise: Promise<CheckState> = process.env.APP_RELEASE_ID?.trim() ? stateOf(async () => {
    const row = await prisma.kvCache.findUnique({ where: { key: CRON_HEARTBEAT_KEY } });
    const heartbeat = row ? parseCronHeartbeat(row.value) : null;
    const fresh = heartbeat && Date.now() - heartbeat.timestamp <= CRON_HEARTBEAT_MAX_AGE_MS;
    if (!fresh || heartbeat.releaseId !== releaseId) throw new Error("CRON_HEARTBEAT_STALE");
  }) : Promise.resolve("skipped");
  const redisPromise: Promise<CheckState> = !redisConfigured
    ? Promise.resolve(redisRequired ? "failed" : "skipped")
    : stateOf(checkRedis, redisRequired ? "failed" : "degraded");
  const metricsPromise = withTimeout(Promise.all([
    prisma.mediaUploadReservation.count({ where: { state: "RESERVED", expiresAt: { gt: new Date() } } }),
    prisma.matchRecognition.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
  ])).catch(() => [null, null] as const);

  const [database, mediaStorage, avatarStorage, cron, redisState, metrics] = await Promise.all([
    databasePromise,
    mediaPromise,
    avatarPromise,
    cronPromise,
    redisPromise,
    metricsPromise,
  ]);
  const checks: Record<CheckName, CheckState> = { database, mediaStorage, avatarStorage, cron, redis: redisState };
  const healthy = Object.values(checks).every((state) => state !== "failed");
  const body: Record<string, unknown> = { ok: healthy, releaseId, mode: "readiness", checks };
  if (tokenMatches(request)) {
    body.metrics = {
      mediaAvailableBytes,
      mediaMinimumFreeBytes: minimumFreeBytes,
      activeMediaReservations: metrics[0],
      activeRecognitions: metrics[1],
    };
  }
  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
