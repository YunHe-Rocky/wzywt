import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { MediaStorage } from "@/lib/storage";

const CLEANUP_PREFIX = "media_cleanup:";

export async function queueMediaCleanup(storageKey: string, reason: string): Promise<void> {
  const digest = createHash("sha256").update(storageKey).digest("hex").slice(0, 48);
  await prisma.kvCache.upsert({
    where: { key: `${CLEANUP_PREFIX}${digest}` },
    create: { key: `${CLEANUP_PREFIX}${digest}`, value: JSON.stringify({ storageKey, reason, queuedAt: new Date().toISOString() }) },
    update: { value: JSON.stringify({ storageKey, reason, queuedAt: new Date().toISOString() }) },
  });
}

export async function deleteOrQueueMedia(
  storage: MediaStorage,
  storageKey: string,
  reason: string,
): Promise<void> {
  try {
    await storage.delete(storageKey);
  } catch {
    await queueMediaCleanup(storageKey, reason);
  }
}

export async function processPendingMediaCleanup(
  storage: MediaStorage,
  limit = 50,
): Promise<{ processed: number; failed: number }> {
  const jobs = await prisma.kvCache.findMany({
    where: { key: { startsWith: CLEANUP_PREFIX } },
    orderBy: { key: "asc" },
    take: Math.max(1, Math.min(limit, 200)),
  });
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const parsed = JSON.parse(job.value) as { storageKey?: unknown };
      if (typeof parsed.storageKey !== "string") throw new Error("INVALID_CLEANUP_JOB");
      await storage.delete(parsed.storageKey);
      await prisma.kvCache.delete({ where: { key: job.key } });
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}
