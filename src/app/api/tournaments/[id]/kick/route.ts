export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { reconcileOrDeleteTournament } from "@/features/tournaments/server/lifecycle";
import { tryReadJsonRequest } from "@/lib/request-validation";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const body = await tryReadJsonRequest<{ targetUserId?: unknown }>(req);
  if (!body.ok) return body.response;
  const { targetUserId } = body.value;
  if (typeof targetUserId !== "number" || !Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: "目标用户无效" }, { status: 400 });
  }

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可踢人" }, { status: 403 });

  const targetIsOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: targetUserId, role: "owner" },
  });
  if (targetIsOwner) return NextResponse.json({ error: "不能踢出房主" }, { status: 400 });

  // 如果目标是管理，先降级再踢出
  const targetIsCoOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: targetUserId, role: "co_owner" },
  });

  await prisma.$transaction(async (tx) => {
    if (targetIsCoOwner) {
      await tx.tournamentAdmin.delete({
        where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      });
    }
    await tx.tournamentPlayer.delete({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
    });
    await tx.adminOperation.create({
      data: {
        tournamentId,
        adminId: userId,
        action: targetIsCoOwner ? "demote_and_kick" : "kick",
        targetId: targetUserId,
      },
    });
    await reconcileOrDeleteTournament(tx, tournamentId);
  });

  return NextResponse.json({ ok: true });
}
