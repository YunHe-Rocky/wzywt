export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { canViewTournamentMemberIdentity } from "@/features/tournaments/model";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
    return NextResponse.json({ error: "无效赛事 ID" }, { status: 400 });
  }
  const currentAdmin = await prisma.tournamentAdmin.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { role: true },
  });
  const canViewMemberIdentity = canViewTournamentMemberIdentity(currentAdmin?.role);
  const memberSelect = canViewMemberIdentity
    ? { id: true, username: true, gameNickname: true, gameId: true }
    : { id: true, username: true };

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { include: { user: { select: memberSelect } } },
      admins: { include: { user: { select: { id: true, username: true } } } },
      applications: {
        where: { status: "pending" },
        include: { applicant: { select: { id: true, username: true } } },
      },
      _count: {
        select: {
          players: { where: { isSpectator: false } },
        },
      },
    },
  });

  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  const isPlayer = tournament.players.some((p) => p.userId === userId);

  // 公开且招募中的赛事允许任何人查看
  if (!isPlayer && !(tournament.isPublic && tournament.status === "recruiting")) {
    return NextResponse.json({ error: "你不在该赛事中" }, { status: 403 });
  }

  if (!isPlayer) {
    return NextResponse.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        code: tournament.code,
        deadline: tournament.deadline,
        status: tournament.status,
        isPublic: tournament.isPublic,
        announcement: tournament.announcement,
        splitResult: null,
        playerCount: tournament._count.players,
        players: [],
        admins: [],
        applications: [],
      },
      splitResult: null,
      isVisitor: true,
      canViewMemberIdentity: false,
    });
  }

  return NextResponse.json({
    tournament: {
      ...tournament,
      playerCount: tournament._count.players,
    },
    splitResult: tournament.splitResult,
    isVisitor: false,
    canViewMemberIdentity,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth().catch(() => ({ userId: 0, username: "", role: "" }));
  if (!user.userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);

  if (user.role !== "admin") {
    const admin = await prisma.tournamentAdmin.findFirst({
      where: { tournamentId, userId: user.userId, role: "owner" },
    });
    if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  await prisma.tournament.delete({ where: { id: tournamentId } });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { name, deadline, isPublic, announcement } = await req.json();
  const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(params.id) } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId: tournament.id, userId, role: { in: ["owner", "co_owner"] } },
  });
  if (!admin) return NextResponse.json({ error: "仅管理员可修改赛事" }, { status: 403 });

  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (deadline) data.deadline = new Date(deadline);
  if (typeof isPublic === "boolean") data.isPublic = isPublic;
  if (announcement !== undefined) data.announcement = announcement;

  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data,
  });

  return NextResponse.json({ tournament: updated });
}
