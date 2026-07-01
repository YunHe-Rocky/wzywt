export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { splitTeams } from "@/lib/split";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可分隊" }, { status: 403 });

  // Cooldown for co_owner
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

  // Lock tournament
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  // Get non-spectator players
  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId, isSpectator: false },
    include: {
      user: {
        include: { rolePreferences: true, heroPowers: true },
      },
    },
  });

  // Validate exactly 10 players for 5v5
  if (players.length !== 10) {
    return NextResponse.json({ error: `需要正好10人才能分队，当前${players.length}人` }, { status: 400 });
  }

  // Deadline check: warn if before deadline, but allow
  const now = new Date();
  const isBeforeDeadline = tournament.deadline > now;

  if (tournament.status === "recruiting") {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "locked" } });
  }

  const algoPlayers = players.map((p) => {
    const heroPowers: Record<string, number[]> = {};
    for (const hp of p.user.heroPowers) {
      if (!heroPowers[hp.roleType]) heroPowers[hp.roleType] = [];
      heroPowers[hp.roleType].push(hp.powerScore);
    }
    return {
      userId: p.userId,
      rolePreferences: p.user.rolePreferences || [],
      heroPowers,
    };
  });

  const result = splitTeams(algoPlayers);

  const splitData = {
    teamRed: result?.teamRed || [],
    teamBlue: result?.teamBlue || [],
    strengthDiff: result?.strengthDiff || 0,
    preferenceScore: result?.preferenceScore || 0,
    playerDetails: players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
    })),
  };

  // Persist split result + mark as completed
  await prisma.$executeRawUnsafe(
    "UPDATE tournaments SET split_result = ?, status = 'completed' WHERE id = ?",
    JSON.stringify(splitData), tournamentId
  );

  await prisma.adminOperation.create({
    data: { tournamentId, adminId: userId, action: "split" },
  });

  return NextResponse.json({ ...splitData, isBeforeDeadline });
}
