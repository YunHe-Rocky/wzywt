export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { reconcileTournamentCapacity } from "@/features/tournaments/server/capacity";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  const canLeave = tournament?.status === "recruiting"
    || (
      tournament?.status === "locked"
      && tournament.splitResult === null
      && tournament.deadline.getTime() > Date.now()
    );
  if (!tournament || !canLeave) {
    return NextResponse.json({ error: "赛事已截止" }, { status: 400 });
  }

  const isOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId, role: "owner" },
  });
  if (isOwner) return NextResponse.json({ error: "房主不能退出，请取消赛事" }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    await tx.tournamentPlayer.delete({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    await reconcileTournamentCapacity(tx, tournamentId);
  });
  return NextResponse.json({ ok: true });
}
