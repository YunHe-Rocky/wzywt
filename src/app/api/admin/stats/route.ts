export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const [userCount, tournamentCount, activeTournamentCount, heroCount] = await Promise.all([
    prisma.user.count({ where: { isTemporary: false } }),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: { not: "finished" } } }),
    prisma.hero.count(),
  ]);

  return NextResponse.json({
    userCount,
    tournamentCount,
    activeTournamentCount,
    heroCount,
  });
}
