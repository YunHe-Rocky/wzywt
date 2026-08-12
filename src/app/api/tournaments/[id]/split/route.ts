export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { splitTeams } from "@/core/team-balancing";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { commitTournamentSplit, SplitConflictError } from "@/features/tournaments/server/split";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const tournamentId = Number(params.id);
  if (!Number.isSafeInteger(tournamentId) || tournamentId <= 0) {
    return NextResponse.json({ error: "无效的赛事 ID" }, { status: 400 });
  }

  const admin = await prisma.tournamentAdmin.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { role: true },
  });
  if (!admin) return NextResponse.json({ error: "仅管理员可分队" }, { status: 403 });

  if (admin.role === "co_owner") {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentOwnerSplit = await prisma.adminOperation.findFirst({
      where: {
        tournamentId,
        action: "split",
        createdAt: { gte: fiveMinAgo },
        admin: { tournamentAdmins: { some: { tournamentId, role: "owner" } } },
      },
    });
    if (recentOwnerSplit) {
      return NextResponse.json({ error: "房主5分钟内执行过此操作，请稍后再试" }, { status: 409 });
    }
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { deadline: true, status: true, splitResult: true },
  });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });
  if (tournament.status === "completed" || tournament.splitResult !== null) {
    return NextResponse.json({ error: "赛事已经完成分队" }, { status: 409 });
  }

  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId, isSpectator: false },
    include: { user: { include: { rolePreferences: true, heroPowers: true } } },
    orderBy: { userId: "asc" },
  });
  if (players.length !== 10) {
    return NextResponse.json({ error: `需要正好10人才能分队，当前${players.length}人` }, { status: 400 });
  }

  const algoPlayers = players.map((player) => {
    const heroPowers: Record<string, number[]> = {};
    for (const power of player.user.heroPowers) {
      (heroPowers[power.roleType] ??= []).push(power.powerScore);
    }
    return {
      userId: player.userId,
      rolePreferences: player.user.rolePreferences,
      heroPowers,
    };
  });
  const result = splitTeams(algoPlayers);
  if (!result) {
    return NextResponse.json({ error: "分队输入无效" }, { status: 422 });
  }

  const splitData = {
    ...result,
    playerDetails: players.map((player) => ({
      userId: player.userId,
      username: player.user.username,
    })),
  };
  const expectedPlayerIds = players.map(({ userId: id }) => id);

  try {
    await commitTournamentSplit({ tournamentId, adminId: userId, expectedPlayerIds, splitData });
  } catch (error) {
    if (error instanceof SplitConflictError) {
      return NextResponse.json({ error: "赛事状态已变化，请刷新后重试" }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ...splitData, isBeforeDeadline: tournament.deadline > new Date() });
}
