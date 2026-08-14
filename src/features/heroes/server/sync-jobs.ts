import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { runExclusiveTask } from "@/features/cron/task-lock";
import { downloadAllImages } from "@/features/heroes/server/download-images";
import { syncHeroes, type SyncProgress } from "@/features/heroes/server/sync";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

export const HERO_SYNC_PROGRESS_KEY = "sync:heroes:progress";
const HERO_SYNC_STAMP_KEY = "cron:hero_sync:last_success";
const STALE_RUNNING_MS = 30 * 60 * 1000;

export interface HeroSyncJobProgress extends SyncProgress {
  jobId: string;
  requestedBy: number;
  updatedAt: string;
}

export function parseHeroSyncProgress(value: string): HeroSyncJobProgress | null {
  try {
    const parsed = JSON.parse(value) as Partial<HeroSyncJobProgress>;
    if (
      typeof parsed.jobId !== "string"
      || !Number.isSafeInteger(parsed.requestedBy)
      || typeof parsed.phase !== "string"
      || typeof parsed.current !== "number"
      || typeof parsed.total !== "number"
      || typeof parsed.message !== "string"
      || typeof parsed.updatedAt !== "string"
    ) return null;
    return parsed as HeroSyncJobProgress;
  } catch {
    return null;
  }
}

function isActive(progress: HeroSyncJobProgress | null, now = Date.now()): boolean {
  if (!progress || !["queued", "running"].includes(progress.phase)) return false;
  if (progress.phase === "queued") return true;
  const updatedAt = Date.parse(progress.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt < STALE_RUNNING_MS;
}

async function writeProgress(progress: HeroSyncJobProgress): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.kvCache.findUnique({ where: { key: HERO_SYNC_PROGRESS_KEY } });
    const current = row ? parseHeroSyncProgress(row.value) : null;
    if (!row || current?.jobId !== progress.jobId) return false;
    const updated = await prisma.kvCache.updateMany({
      where: { key: HERO_SYNC_PROGRESS_KEY, value: row.value },
      data: { value: JSON.stringify(progress) },
    });
    if (updated.count === 1) return true;
  }
  return false;
}

export async function queueHeroSync(requestedBy: number): Promise<HeroSyncJobProgress> {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.kvCache.findUnique({ where: { key: HERO_SYNC_PROGRESS_KEY } });
      const current = row ? parseHeroSyncProgress(row.value) : null;
      if (isActive(current)) throw new ServiceError("CONFLICT", "英雄同步任务已在队列或运行中");
      const progress: HeroSyncJobProgress = {
        jobId: randomUUID(),
        requestedBy,
        phase: "queued",
        current: 0,
        total: 0,
        message: "同步任务已进入队列",
        updatedAt: new Date().toISOString(),
      };
      await tx.kvCache.upsert({
        where: { key: HERO_SYNC_PROGRESS_KEY },
        create: { key: HERO_SYNC_PROGRESS_KEY, value: JSON.stringify(progress) },
        update: { value: JSON.stringify(progress) },
      });
      return progress;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new ServiceError("CONFLICT", "同步任务并发入队，请重试");
    }
    throw error;
  }
}

export async function runQueuedHeroSync(): Promise<boolean> {
  const row = await prisma.kvCache.findUnique({ where: { key: HERO_SYNC_PROGRESS_KEY } });
  const candidate = row ? parseHeroSyncProgress(row.value) : null;
  if (!candidate || candidate.phase !== "queued") return false;

  return runExclusiveTask("hero-pipeline", 2 * 60 * 60 * 1000, async () => {
    const latestRow = await prisma.kvCache.findUnique({ where: { key: HERO_SYNC_PROGRESS_KEY } });
    const latest = latestRow ? parseHeroSyncProgress(latestRow.value) : null;
    if (!latest || latest.jobId !== candidate.jobId || latest.phase !== "queued") return;

    const base = { jobId: latest.jobId, requestedBy: latest.requestedBy };
    const claimed = await writeProgress({
      ...base,
      phase: "running",
      current: 0,
      total: 0,
      message: "正在启动英雄同步",
      updatedAt: new Date().toISOString(),
    });
    if (!claimed) return;

    let progressWrites = Promise.resolve();
    const onProgress = (progress: SyncProgress) => {
      progressWrites = progressWrites.then(async () => {
        await writeProgress({
          ...base,
          ...progress,
          phase: "running",
          updatedAt: new Date().toISOString(),
        });
      });
    };

    try {
      const result = await syncHeroes(onProgress);
      await progressWrites;
      const images = await downloadAllImages();
      await prisma.kvCache.upsert({
        where: { key: HERO_SYNC_STAMP_KEY },
        create: { key: HERO_SYNC_STAMP_KEY, value: String(Date.now()) },
        update: { value: String(Date.now()) },
      });
      await writeProgress({
        ...base,
        phase: "done",
        current: 1,
        total: 1,
        message: `同步完成：${result.inserted} 新增，${result.updated} 更新，${images.heroes + images.skins} 张图片刷新`,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      await progressWrites.catch(() => undefined);
      await writeProgress({
        ...base,
        phase: "error",
        current: 0,
        total: 0,
        message: error instanceof Error ? `同步失败：${error.message}` : "同步失败",
        updatedAt: new Date().toISOString(),
      }).catch(() => false);
      throw error;
    }
  });
}
