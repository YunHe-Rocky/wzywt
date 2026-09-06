import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { getMediaStorage, type MediaStorage } from "@/lib/storage";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const MAX_SAFE_QUOTA = Number.MAX_SAFE_INTEGER;

export type MediaUploadKind = "match-screenshot" | "combat-video";

function configuredBytes(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_SAFE_QUOTA ? parsed : fallback;
}

function quotaLimits() {
  return {
    userStored: configuredBytes("MEDIA_USER_STORED_QUOTA_BYTES", 2 * 1024 ** 3),
    userDaily: configuredBytes("MEDIA_USER_DAILY_QUOTA_BYTES", 512 * 1024 ** 2),
    globalStored: configuredBytes("MEDIA_GLOBAL_STORED_QUOTA_BYTES", 50 * 1024 ** 3),
    minimumFree: configuredBytes("MEDIA_MIN_FREE_BYTES", 2 * 1024 ** 3),
  };
}

export function getMediaMinimumFreeBytes(): number {
  return quotaLimits().minimumFree;
}

function sumNumber(value: number | bigint | null | undefined): number {
  const number = typeof value === "bigint" ? Number(value) : value ?? 0;
  if (!Number.isSafeInteger(number) || number < 0) throw new ServiceError("SERVICE_UNAVAILABLE", "媒体容量统计超出安全范围");
  return number;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function checkFilesystemBudget(requestedBytes: number): Promise<void> {
  const storage = getMediaStorage();
  if (!storage.availableBytes) return;
  const available = await storage.availableBytes();
  const minimumFree = quotaLimits().minimumFree;
  if (!Number.isFinite(available) || available < requestedBytes + minimumFree) {
    throw new ServiceError("SERVICE_UNAVAILABLE", "媒体存储剩余空间不足，请联系管理员", {
      code: "MEDIA_LOW_SPACE",
      availableBytes: Number.isFinite(available) ? available : null,
      requiredBytes: requestedBytes + minimumFree,
    });
  }
}

export async function reserveMediaUpload(
  userId: number,
  kind: MediaUploadKind,
  requestedBytes: number,
  now = new Date(),
): Promise<{ id: string; bytes: number; expiresAt: Date }> {
  if (!Number.isSafeInteger(requestedBytes) || requestedBytes <= 0) {
    throw new ServiceError("VALIDATION_ERROR", "媒体预留大小无效");
  }
  await checkFilesystemBudget(requestedBytes);
  const limits = quotaLimits();
  const dayStart = startOfUtcDay(now);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const activeReservation = { state: "RESERVED", expiresAt: { gt: now } };
        const [
          userScreenshots,
          userVideos,
          allScreenshots,
          allVideos,
          dailyScreenshots,
          dailyVideos,
          userReserved,
          allReserved,
          dailyReserved,
        ] = await Promise.all([
          tx.matchScreenshot.aggregate({ where: { uploadedById: userId }, _sum: { size: true } }),
          tx.combatPost.aggregate({ where: { authorId: userId, status: { not: "deleted" } }, _sum: { size: true } }),
          tx.matchScreenshot.aggregate({ _sum: { size: true } }),
          tx.combatPost.aggregate({ where: { status: { not: "deleted" } }, _sum: { size: true } }),
          tx.matchScreenshot.aggregate({ where: { uploadedById: userId, createdAt: { gte: dayStart } }, _sum: { size: true } }),
          tx.combatPost.aggregate({ where: { authorId: userId, status: { not: "deleted" }, createdAt: { gte: dayStart } }, _sum: { size: true } }),
          tx.mediaUploadReservation.aggregate({ where: { userId, ...activeReservation }, _sum: { bytes: true } }),
          tx.mediaUploadReservation.aggregate({ where: activeReservation, _sum: { bytes: true } }),
          tx.mediaUploadReservation.aggregate({ where: { userId, createdAt: { gte: dayStart }, ...activeReservation }, _sum: { bytes: true } }),
        ]);
        const userStored = sumNumber(userScreenshots._sum.size) + sumNumber(userVideos._sum.size) + sumNumber(userReserved._sum.bytes);
        const globalStored = sumNumber(allScreenshots._sum.size) + sumNumber(allVideos._sum.size) + sumNumber(allReserved._sum.bytes);
        const userDaily = sumNumber(dailyScreenshots._sum.size) + sumNumber(dailyVideos._sum.size) + sumNumber(dailyReserved._sum.bytes);
        const exceeded = [
          { scope: "USER_STORED", current: userStored, limit: limits.userStored },
          { scope: "USER_DAILY", current: userDaily, limit: limits.userDaily },
          { scope: "GLOBAL_STORED", current: globalStored, limit: limits.globalStored },
        ].find(({ current, limit }) => current + requestedBytes > limit);
        if (exceeded) {
          throw new ServiceError("PAYLOAD_TOO_LARGE", "媒体配额不足，无法接受本次上传", {
            code: "MEDIA_QUOTA_EXCEEDED",
            scope: exceeded.scope,
            currentBytes: exceeded.current,
            requestedBytes,
            limitBytes: exceeded.limit,
          });
        }
        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
        const reservation = await tx.mediaUploadReservation.create({
          data: { id: randomUUID(), userId, kind, bytes: BigInt(requestedBytes), expiresAt },
          select: { id: true, bytes: true, expiresAt: true },
        });
        return { id: reservation.id, bytes: sumNumber(reservation.bytes), expiresAt: reservation.expiresAt };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retry = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (retry && attempt < 2) continue;
      throw error;
    }
  }
  throw new ServiceError("CONFLICT", "媒体配额预留发生并发冲突，请重试");
}

export async function attachMediaReservation(
  reservationId: string,
  userId: number,
  storageKey: string,
  actualBytes: number,
): Promise<void> {
  if (!Number.isSafeInteger(actualBytes) || actualBytes <= 0) throw new ServiceError("VALIDATION_ERROR", "媒体文件大小无效");
  const reservation = await prisma.mediaUploadReservation.findFirst({
    where: { id: reservationId, userId, state: "RESERVED", expiresAt: { gt: new Date() } },
    select: { bytes: true },
  });
  if (!reservation || BigInt(actualBytes) > reservation.bytes) {
    throw new ServiceError("CONFLICT", "媒体上传预留已失效或实际大小超出预留");
  }
  const updated = await prisma.mediaUploadReservation.updateMany({
    where: { id: reservationId, userId, state: "RESERVED", storageKey: null },
    data: { storageKey, bytes: BigInt(actualBytes) },
  });
  if (updated.count !== 1) throw new ServiceError("CONFLICT", "媒体上传预留状态已变化");
}

export async function consumeMediaReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
  userId: number,
  storageKey: string,
  actualBytes: number,
): Promise<void> {
  const removed = await tx.mediaUploadReservation.deleteMany({
    where: { id: reservationId, userId, state: "RESERVED", storageKey, bytes: BigInt(actualBytes) },
  });
  if (removed.count !== 1) throw new ServiceError("CONFLICT", "媒体上传预留已失效，请重新上传");
}

export async function releaseMediaReservation(reservationId: string, userId: number): Promise<void> {
  await prisma.mediaUploadReservation.deleteMany({ where: { id: reservationId, userId, state: "RESERVED" } });
}

export async function processExpiredMediaReservations(
  storage: MediaStorage,
  now = new Date(),
  limit = 50,
): Promise<{ processed: number; failed: number }> {
  const reservations = await prisma.mediaUploadReservation.findMany({
    where: { state: "RESERVED", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: Math.max(1, Math.min(200, limit)),
    select: { id: true, storageKey: true },
  });
  let processed = 0;
  let failed = 0;
  for (const reservation of reservations) {
    try {
      if (reservation.storageKey) await storage.delete(reservation.storageKey);
      await prisma.mediaUploadReservation.deleteMany({ where: { id: reservation.id, state: "RESERVED", expiresAt: { lte: now } } });
      processed++;
    } catch {
      failed++;
    }
  }
  return { processed, failed };
}

