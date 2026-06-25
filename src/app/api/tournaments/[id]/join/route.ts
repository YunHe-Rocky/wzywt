export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });
  if (tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事已截止报名" }, { status: 400 });
  }

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (existing) return NextResponse.json({ error: "你已在赛事中" }, { status: 409 });

  const player = await prisma.tournamentPlayer.create({
    data: { tournamentId, userId, isSpectator: false },
    include: { user: { select: { id: true, username: true } } },
  });

  return NextResponse.json({ player });
}
