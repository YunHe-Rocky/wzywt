import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { tryParseRouteId } from "@/lib/request-validation";
import { reconcileOrDeleteTournament } from "@/features/tournaments/server/lifecycle";

async function handlePOST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
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
    await reconcileOrDeleteTournament(tx, tournamentId);
  });
  return NextResponse.json({ ok: true });
}

export const POST = withRequestCapacity(handlePOST);
