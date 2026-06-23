import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { tempName } = await req.json();

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事不可用" }, { status: 400 });
  }

  const app = await prisma.tempPlayerApplication.create({
    data: { tournamentId, applicantId: userId, tempName: tempName || null, status: "pending" },
  });

  return NextResponse.json({ application: app });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可查看申请" }, { status: 403 });

  const apps = await prisma.tempPlayerApplication.findMany({
    where: { tournamentId, status: "pending" },
    include: { applicant: { select: { id: true, username: true } } },
  });

  return NextResponse.json({ applications: apps });
}
