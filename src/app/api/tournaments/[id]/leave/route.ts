export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事已截止" }, { status: 400 });
  }

  const isOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId, role: "owner" },
  });
  if (isOwner) return NextResponse.json({ error: "房主不能退出，请取消赛事" }, { status: 400 });

  await prisma.tournamentPlayer.delete({ where: { tournamentId_userId: { tournamentId, userId } } });
  return NextResponse.json({ ok: true });
}
