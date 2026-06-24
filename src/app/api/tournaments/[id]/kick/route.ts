import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { targetUserId } = await req.json();

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可踢人" }, { status: 403 });

  const targetIsOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: targetUserId, role: "owner" },
  });
  if (targetIsOwner) return NextResponse.json({ error: "不能踢出房主" }, { status: 400 });

  // 如果目标是次房主，先降级再踢出
  const targetIsCoOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: targetUserId, role: "co_owner" },
  });

  await prisma.$transaction([
    ...(targetIsCoOwner
      ? [prisma.tournamentAdmin.delete({ where: { tournamentId_userId: { tournamentId, userId: targetUserId } } })]
      : []),
    prisma.tournamentPlayer.delete({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
    }),
    prisma.adminOperation.create({
      data: {
        tournamentId,
        adminId: userId,
        action: targetIsCoOwner ? "demote_and_kick" : "kick",
        targetId: targetUserId,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
