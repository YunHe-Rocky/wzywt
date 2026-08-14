export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import {
  canViewTournamentMemberIdentity,
  normalizeTournamentDraft,
  parsePositiveInteger,
  TournamentValidationError,
} from "@/features/tournaments/model";
import { reconcileTournamentCapacity } from "@/features/tournaments/server/capacity";
import { tryReadJsonRequest } from "@/lib/request-validation";

function parseTournamentId(value: string): number | NextResponse {
  try {
    return parsePositiveInteger(value, "赛事 ID");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const parsedId = parseTournamentId(params.id);
  if (parsedId instanceof NextResponse) return parsedId;
  const tournamentId = parsedId;
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

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const user = auth.user;

  const parsedId = parseTournamentId(params.id);
  if (parsedId instanceof NextResponse) return parsedId;
  const tournamentId = parsedId;

  if (user.role !== "admin") {
    const admin = await prisma.tournamentAdmin.findFirst({
      where: { tournamentId, userId: user.userId, role: "owner" },
    });
    if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  await prisma.tournament.delete({ where: { id: tournamentId } });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const parsedId = parseTournamentId(params.id);
  if (parsedId instanceof NextResponse) return parsedId;
  const tournamentId = parsedId;
  const parsedBody = await tryReadJsonRequest<Record<string, unknown>>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;

  let draft;
  try {
    draft = normalizeTournamentDraft(body, { partial: true });
  } catch (error) {
    if (error instanceof TournamentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId: tournament.id, userId, role: { in: ["owner", "co_owner"] } },
  });
  if (!admin) return NextResponse.json({ error: "仅管理员可修改赛事" }, { status: 403 });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.tournament.update({
      where: { id: tournament.id },
      data: draft,
    });
    await reconcileTournamentCapacity(tx, tournament.id);
    return tx.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
  });

  return NextResponse.json({ tournament: updated });
}
