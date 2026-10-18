import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { detectAvatarImageType, MAX_AVATAR_SIZE } from "./avatar";
import { ensureAvatarDirectory, getAvatarDirectory } from "./avatar-storage";

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

export async function uploadAccountAvatar(userId: number, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size <= 0) throw new ServiceError("VALIDATION_ERROR", "请选择有效图片文件");
  if (file.size > MAX_AVATAR_SIZE) throw new ServiceError("PAYLOAD_TOO_LARGE", "图片大小不能超过 2MB");
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = detectAvatarImageType(buffer);
  if (!type || type.mime !== file.type) throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "仅支持有效的 JPG、PNG 或 WebP 图片");
  try {
    const image = sharp(buffer, { limitInputPixels: 12_000_000, failOn: "error" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages || 1) !== 1) throw new Error("Invalid dimensions");
    await image.stats(); // Decode the payload, rather than accepting its magic bytes.
  } catch { throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "图片损坏、包含动画或超过 1200 万像素限制"); }
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true, sessionVersion: true } });
  if (!current) throw new ServiceError("NOT_FOUND", "用户不存在");
  const directory = await ensureAvatarDirectory();
  const filename = `${userId}_${randomUUID()}.${type.extension}`;
  const temporary = `${filename}.tmp`;
  try {
    await writeFile(join(directory, temporary), buffer, { flag: "wx" });
    await rename(join(directory, temporary), join(directory, filename));
    const updated = await prisma.user.updateMany({
      where: { id: userId, avatar: current.avatar, sessionVersion: current.sessionVersion, banned: false, deletedAt: null },
      data: { avatar: filename },
    });
    if (updated.count !== 1) throw new ServiceError("CONFLICT", "头像或账户已变化，请重试");
  } catch (error) {
    await deleteOrQueueAvatar(temporary); await deleteOrQueueAvatar(filename); throw error;
  }
  if (current.avatar && basename(current.avatar) === current.avatar) await deleteOrQueueAvatar(current.avatar);
  return filename;
}
