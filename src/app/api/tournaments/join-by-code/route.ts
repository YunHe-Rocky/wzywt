export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "请输入赛事号" }, { status: 400 });

  const tournament = await prisma.tournament.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      deadline: true,
      status: true,
      isPublic: true,
      announcement: true,
      _count: {
        select: {
          players: { where: { isSpectator: false } },
        },
      },
    },
  });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  const existingPlayer = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
    select: { id: true },
  });
  const playerCount = tournament._count.players;
  const deadlinePassed = tournament.deadline.getTime() <= Date.now();
  const canJoin = tournament.status === "recruiting"
    && !deadlinePassed
    && playerCount < 10;
  const unavailableReason = canJoin || existingPlayer
    ? null
    : playerCount >= 10
      ? "房间已满员，报名自动截止"
      : "房间报名已截止";

  return NextResponse.json({
    room: {
      id: tournament.id,
      code: tournament.code,
      name: tournament.name,
      deadline: tournament.deadline.toISOString(),
      status: tournament.status,
      isPublic: tournament.isPublic,
      announcement: tournament.announcement,
      playerCount,
    },
    existing: Boolean(existingPlayer),
    canJoin,
    unavailableReason,
  });
}
