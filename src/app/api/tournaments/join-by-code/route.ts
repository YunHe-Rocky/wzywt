import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "请输入赛事号" }, { status: 400 });

  const tournament = await prisma.tournament.findUnique({ where: { code } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });
  if (tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事已截止" }, { status: 400 });
  }

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
  });
  if (existing) return NextResponse.json({ error: "你已在赛事中" }, { status: 409 });

  await prisma.tournamentPlayer.create({
    data: { tournamentId: tournament.id, userId, isSpectator: false },
  });

  return NextResponse.json({ tournamentId: tournament.id, name: tournament.name });
}
