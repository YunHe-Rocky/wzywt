export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { normalizeTournamentDraft, TournamentValidationError } from "@/features/tournaments/model";

function generateCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export async function GET() {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

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
      _count: { select: { players: { where: { isSpectator: false } } } },
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
      players: { some: { isSpectator: false } },
      admins: { some: { role: "owner" } },
    },
    include: {
      _count: { select: { players: { where: { isSpectator: false } } } },
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
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  let draft;
  try {
    draft = normalizeTournamentDraft(body);
  } catch (error) {
    if (error instanceof TournamentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const tournament = await prisma.tournament.create({
        data: {
          name: draft.name!,
          code: generateCode(),
          deadline: draft.deadline!,
          isPublic: draft.isPublic!,
          announcement: draft.announcement ?? null,
          admins: { create: { userId, role: "owner" } },
          players: { create: { userId, isSpectator: false } },
        },
        include: { admins: true, _count: { select: { players: true } } },
      });
      return NextResponse.json({ tournament });
    } catch (error) {
      const codeCollision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!codeCollision || attempt === 4) throw error;
    }
  }
  throw new Error("unreachable");
}
