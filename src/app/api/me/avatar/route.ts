export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeFile, unlink } from "fs/promises";
import { basename, join } from "path";
import {
  detectAvatarImageType,
  MAX_AVATAR_SIZE,
} from "@/features/profile/server/avatar";
import { ensureAvatarDirectory } from "@/features/profile/server/avatar-storage";
import { readFormDataRequest } from "@/lib/request-validation";
import { apiErrorResponse } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  let formData: FormData;
  try {
    formData = await readFormDataRequest(req, MAX_AVATAR_SIZE + 256 * 1024);
  } catch (error) {
    return apiErrorResponse(error);
  }
  const file = formData.get("avatar") as File | null;
  if (!file) return NextResponse.json({ error: "请选择图片" }, { status: 400 });

  if (file.size > MAX_AVATAR_SIZE) {
    return NextResponse.json({ error: "图片大小不能超过 2MB" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "图片文件为空" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageType = detectAvatarImageType(buffer);
  if (!imageType || imageType.mime !== file.type) {
    return NextResponse.json({ error: "仅支持有效的 JPG、PNG 或 WebP 图片" }, { status: 400 });
  }

  const avatarDirectory = await ensureAvatarDirectory();
  const filename = `${userId}_${Date.now()}.${imageType.extension}`;
  const nextPath = join(avatarDirectory, filename);
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });
  await writeFile(nextPath, buffer);

  try {
    await prisma.user.update({ where: { id: userId }, data: { avatar: filename } });
  } catch (error) {
    await unlink(nextPath).catch(() => {});
    throw error;
  }

  // 数据库更新成功后再清理旧文件，失败不会影响新头像。
  if (current?.avatar && basename(current.avatar) === current.avatar) {
    await unlink(join(avatarDirectory, current.avatar)).catch(() => {});
  }

  return NextResponse.json({ avatar: filename });
}
