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

  await prisma.tournamentPlayer.delete({
    where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
  });

  await prisma.adminOperation.create({
    data: { tournamentId, adminId: userId, action: "kick", targetId: targetUserId },
  });

  return NextResponse.json({ ok: true });
}
