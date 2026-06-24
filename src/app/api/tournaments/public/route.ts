import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    where: { status: "recruiting", isPublic: true },
    select: {
      id: true,
      name: true,
      code: true,
      deadline: true,
      announcement: true,
      _count: { select: { players: { where: { isSpectator: false } } } },
    },
    orderBy: { deadline: "asc" },
    take: 6,
  });

  return NextResponse.json({ tournaments }, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
