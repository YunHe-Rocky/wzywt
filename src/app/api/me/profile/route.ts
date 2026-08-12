export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeGameProfile } from "@/features/profile/model";

export async function PATCH(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  let gameProfile;
  try {
    gameProfile = normalizeGameProfile({
      gameNickname: body.gameNickname,
      gameId: body.gameId,
    });
  } catch {
    return NextResponse.json({
      error: "游戏昵称不能超过 32 字，游戏 ID 不能超过 64 字",
    }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: gameProfile,
    select: { gameNickname: true, gameId: true },
  });

  return NextResponse.json(user);
}
