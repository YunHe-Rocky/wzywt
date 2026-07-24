export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  TOURNAMENT_CAPACITY,
  TournamentCapacityError,
} from "@/features/tournaments/server/capacity";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const body = await req.json().catch(() => ({}));
  const newDeadline = typeof body.newDeadline === "string"
    ? new Date(body.newDeadline)
    : null;
  if (!newDeadline || Number.isNaN(newDeadline.getTime())) {
    return NextResponse.json({ error: "请提供有效的新截止时间" }, { status: 400 });
  }

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员操作" }, { status: 403 });

  // Cooldown check for co_owner
  if (admin.role === "co_owner") {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentOwnerOp = await prisma.adminOperation.findFirst({
      where: {
        tournamentId,
        action: "extend",
        createdAt: { gte: fiveMinAgo },
        admin: { tournamentAdmins: { some: { tournamentId, role: "owner" } } },
      },
    });
    if (recentOwnerOp) {
      return NextResponse.json({ error: "房主5分钟内执行过此操作，请稍后再试" }, { status: 409 });
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const [tournament, playerCount] = await Promise.all([
        tx.tournament.findUnique({
          where: { id: tournamentId },
          select: { deadline: true, splitResult: true, status: true },
        }),
        tx.tournamentPlayer.count({
          where: { tournamentId, isSpectator: false },
        }),
      ]);
      if (!tournament) {
        throw new TournamentCapacityError("TOURNAMENT_NOT_FOUND", "赛事不存在", 404);
      }
      if (tournament.splitResult !== null || tournament.status === "completed") {
        throw new TournamentCapacityError("TOURNAMENT_CLOSED", "已完成分队，不能延长报名", 409);
      }
      const minimumTime = Math.max(Date.now(), tournament.deadline.getTime());
      if (newDeadline.getTime() <= minimumTime) {
        throw new TournamentCapacityError(
          "TOURNAMENT_CLOSED",
          "新截止时间必须晚于当前截止时间",
          400,
        );
      }
      if (playerCount >= TOURNAMENT_CAPACITY) {
        throw new TournamentCapacityError(
          "TOURNAMENT_FULL",
          "房间已满员，无需延长报名",
          409,
        );
      }

      const tournamentAfterUpdate = await tx.tournament.update({
        where: { id: tournamentId },
        data: { deadline: newDeadline, status: "recruiting" },
        select: { deadline: true, status: true },
      });
      await tx.adminOperation.create({
        data: { tournamentId, adminId: userId, action: "extend" },
      });
      return tournamentAfterUpdate;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return NextResponse.json({
      ok: true,
      deadline: updated.deadline.toISOString(),
      status: updated.status,
    });
  } catch (error) {
    if (error instanceof TournamentCapacityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
