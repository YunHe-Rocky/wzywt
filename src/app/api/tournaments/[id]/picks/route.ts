export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";

const VALID_ROLES = ["top", "jungle", "mid", "adc", "support"];

// GET 获取两队选人数据
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const tournamentId = parseInt(params.id);
  const picks = await prisma.tournamentPick.findMany({
    where: { tournamentId },
    orderBy: { team: "asc" },
  });

  // Fetch hero names
  const heroIds = Array.from(new Set(picks.map((p) => p.heroId)));
  const heroes = await prisma.hero.findMany({
    where: { heroId: { in: heroIds } },
    select: { heroId: true, name: true, roleType: true },
  });
  const heroMap = new Map(heroes.map((h) => [h.heroId, h]));

  const result = picks.map((p) => ({
    ...p,
    heroName: heroMap.get(p.heroId)?.name || "?",
  }));

  return NextResponse.json({ picks: result });
}

// PUT 保存选人
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);

  // Check admin or the player themselves
  const isAdmin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  const isPlayer = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId, userId, isSpectator: false, isTemporary: false },
  });

  if (!isAdmin && !isPlayer) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();
  const { heroId, equipIds, team, roleType, targetUserId: bodyTarget } = body;

  // Only admins can set other players' picks
  const targetUserId = isAdmin ? (bodyTarget || userId) : userId;

  // Validate hero belongs to the assigned role
  if (heroId) {
    const hero = await prisma.hero.findUnique({ where: { heroId } });
    if (!hero) return NextResponse.json({ error: "英雄不存在" }, { status: 400 });

    // Check role restriction
    if (roleType && !VALID_ROLES.includes(roleType)) {
      return NextResponse.json({ error: "无效分路" }, { status: 400 });
    }
  }

  // Get existing pick
  const existing = await prisma.tournamentPick.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
  });

  const data = {
    tournamentId,
    userId: targetUserId,
    team: team || existing?.team || "red",
    roleType: roleType || existing?.roleType || "",
    heroId: heroId || existing?.heroId || 0,
    equipJson: equipIds || existing?.equipJson || [],
  };

  if (existing) {
    await prisma.tournamentPick.update({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      data: { heroId: data.heroId, equipJson: data.equipJson, team: data.team, roleType: data.roleType },
    });
  } else {
    if (!heroId) return NextResponse.json({ error: "请先选择英雄" }, { status: 400 });
    await prisma.tournamentPick.create({ data });
  }

  return NextResponse.json({ ok: true });
}
