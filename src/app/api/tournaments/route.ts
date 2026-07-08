export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  // 我的赛事（参与的 + 管理的）
  const tournaments = await prisma.tournament.findMany({
    where: {
      OR: [
        { players: { some: { userId } } },
        { admins: { some: { userId } } },
      ],
      status: { not: "finished" },
    },
    include: {
      _count: { select: { players: true } },
      admins: { select: { userId: true, role: true } },
    },
    orderBy: { deadline: "asc" },
  });

  const myIds = tournaments.map((t) => t.id);

  // 公开可报名的赛事（排除已加入的）
  const publicTournaments = await prisma.tournament.findMany({
    where: {
      isPublic: true,
      status: "recruiting",
      id: { notIn: myIds },
    },
    include: {
      _count: { select: { players: true } },
      admins: { select: { userId: true, role: true } },
    },
    orderBy: { deadline: "asc" },
  });

  return NextResponse.json({
    tournaments,
    publicTournaments,
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { name, deadline, isPublic, announcement } = await req.json();
  if (!name || !deadline) {
    return NextResponse.json({ error: "赛事名称和截止时间必填" }, { status: 400 });
  }
  if (new Date(deadline) < new Date()) {
    return NextResponse.json({ error: "截止时间不能是过去" }, { status: 400 });
  }

  const code = generateCode();

  const tournament = await prisma.tournament.create({
    data: {
      name,
      code,
      deadline: new Date(deadline),
      isPublic: isPublic === true,
      announcement: announcement || null,
      admins: { create: { userId, role: "owner" } },
      players: { create: { userId, isSpectator: false } },
    },
    include: { admins: true, _count: { select: { players: true } } },
  });

  return NextResponse.json({ tournament });
}
