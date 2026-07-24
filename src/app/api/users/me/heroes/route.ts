export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { normalizeHeroPowerScore, ROLES } from "@/core/game";

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const powers = await prisma.heroPower.findMany({ where: { userId } });
  const grouped: Record<string, typeof powers> = {};
  for (const p of powers) {
    if (!grouped[p.roleType]) grouped[p.roleType] = [];
    grouped[p.roleType].push(p);
  }
  return NextResponse.json({ heroPowers: grouped });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { roleType, heroId, heroName, powerScore } = await req.json();
  if (
    typeof roleType !== "string"
    || !ROLES.includes(roleType as (typeof ROLES)[number])
    || !Number.isInteger(heroId)
    || heroId <= 0
    || typeof heroName !== "string"
    || !heroName.trim()
  ) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  let normalizedPowerScore: number;
  try {
    normalizedPowerScore = normalizeHeroPowerScore(powerScore);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "英雄战力无效",
    }, { status: 400 });
  }

  const count = await prisma.heroPower.count({ where: { userId, roleType } });
  if (count >= 3) {
    return NextResponse.json({ error: "每个分路最多3个英雄" }, { status: 400 });
  }

  const created = await prisma.heroPower.create({
    data: {
      userId,
      roleType,
      heroId,
      heroName: heroName.trim(),
      powerScore: normalizedPowerScore,
    },
  });
  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  const existing = await prisma.heroPower.findFirst({ where: { id: parseInt(id), userId } });
  if (!existing) return NextResponse.json({ error: "不存在" }, { status: 404 });

  await prisma.heroPower.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
