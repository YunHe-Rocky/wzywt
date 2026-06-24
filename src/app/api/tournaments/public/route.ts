import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));

  const tournaments = await prisma.tournament.findMany({
    where: { status: "recruiting", isPublic: true },
    select: {
      id: true,
      name: true,
      code: true,
      deadline: true,
      announcement: true,
      players: userId > 0 ? { where: { userId }, select: { userId: true } } : false,
      _count: { select: { players: { where: { isSpectator: false } } } },
    },
    orderBy: { deadline: "asc" },
    take: 6,
  });

  const result = tournaments.map((t) => {
    const { players, ...rest } = t as any;
    return {
      ...rest,
      joined: userId > 0 ? (players && players.length > 0) : false,
    };
  });

  return NextResponse.json({ tournaments: result });
}
