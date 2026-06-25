export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { tempName } = await req.json();

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员操作" }, { status: 403 });

  const tempUser = await prisma.user.create({
    data: { username: tempName || `临时_${Date.now()}`, passwordHash: "" },
  });

  const player = await prisma.tournamentPlayer.create({
    data: { tournamentId, userId: tempUser.id, isTemporary: true, tempName, isSpectator: false },
  });

  return NextResponse.json({ player });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { targetUserId, heroPowers } = await req.json();

  // Admin or original applicant can fill temp player data
  const isAdmin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可为临时人员补填资料" }, { status: 403 });
  }

  if (heroPowers && Array.isArray(heroPowers)) {
    for (const hp of heroPowers) {
      await prisma.heroPower.create({
        data: { userId: targetUserId, roleType: hp.roleType, heroId: hp.heroId, heroName: hp.heroName || "", powerScore: hp.powerScore },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
