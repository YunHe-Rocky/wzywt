export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeFile, mkdir, unlink } from "fs/promises";
import { basename, join } from "path";
import { existsSync } from "fs";

const AVATAR_DIR = process.env.AVATAR_DIR || "/data/uploads/avatars";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("avatar") as File | null;
  if (!file) return NextResponse.json({ error: "请选择图片" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "仅支持 JPG/PNG/WebP 格式" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片大小不能超过 2MB" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "图片文件为空" }, { status: 400 });
  }

  if (!existsSync(AVATAR_DIR)) {
    await mkdir(AVATAR_DIR, { recursive: true });
  }

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const filename = `${userId}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const nextPath = join(AVATAR_DIR, filename);
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
    await unlink(join(AVATAR_DIR, current.avatar)).catch(() => {});
  }

  return NextResponse.json({ avatar: filename });
}
