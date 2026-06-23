import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

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

  return NextResponse.json({ tournaments });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { name, deadline } = await req.json();
  if (!name || !deadline) {
    return NextResponse.json({ error: "赛事名称和截止时间必填" }, { status: 400 });
  }

  const code = generateCode();

  const tournament = await prisma.tournament.create({
    data: {
      name,
      code,
      deadline: new Date(deadline),
      admins: { create: { userId, role: "owner" } },
      players: { create: { userId, isSpectator: false } },
    },
    include: { admins: true, _count: { select: { players: true } } },
  });

  return NextResponse.json({ tournament });
}
