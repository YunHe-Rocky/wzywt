import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { prisma } from "@/lib/db";
import { getAvatarDirectory } from "./avatar-storage";

// Cron shares file cleanup without loading the image decoder used by uploads.
const CLEANUP = "avatar_cleanup:";

export async function deleteOrQueueAvatar(filename: string) {
  if (basename(filename) !== filename) throw new Error("Invalid avatar filename");
  try { await unlink(join(getAvatarDirectory(), filename)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    const key = `${CLEANUP}${filename}`;
    const value = JSON.stringify({ filename });
    await prisma.kvCache.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

export async function processAvatarCleanup(limit = 50) {
  const jobs = await prisma.kvCache.findMany({ where: { key: { startsWith: CLEANUP } }, take: limit, orderBy: { key: "asc" } });
  let processed = 0; let failed = 0;
  for (const job of jobs) {
    try {
      const { filename } = JSON.parse(job.value);
      if (typeof filename !== "string" || basename(filename) !== filename) throw new Error("Invalid cleanup job");
      if (await prisma.user.count({ where: { avatar: filename } })) continue;
      try { await unlink(join(getAvatarDirectory(), filename)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await prisma.kvCache.delete({ where: { key: job.key } }); processed++;
    } catch { failed++; }
  }
  return { processed, failed };
}
