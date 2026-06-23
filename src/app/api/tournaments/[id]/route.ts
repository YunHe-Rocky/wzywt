import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: parseInt(params.id) },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      admins: { include: { user: { select: { id: true, username: true } } } },
      applications: {
        where: { status: "pending" },
        include: { applicant: { select: { id: true, username: true } } },
      },
    },
  });

  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  const isPlayer = tournament.players.some((p) => p.userId === userId);
  if (!isPlayer) return NextResponse.json({ error: "你不在该赛事中" }, { status: 403 });

  return NextResponse.json({
    tournament,
    splitResult: tournament.splitResult,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(params.id) } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId: tournament.id, userId, role: "owner" },
  });
  if (!admin) return NextResponse.json({ error: "仅房主可取消赛事" }, { status: 403 });

  await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "finished" } });
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
