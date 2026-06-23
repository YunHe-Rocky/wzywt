import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const heroId = parseInt(params.id);
  if (!heroId) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  const hero = await prisma.hero.findUnique({ where: { heroId } });
  if (!hero) return NextResponse.json({ error: "英雄不存在" }, { status: 404 });

  // Check for manual lane override
  const override = await prisma.heroLaneOverride.findUnique({ where: { heroId } });

  return NextResponse.json({
    id: hero.id,
    heroId: hero.heroId,
    name: hero.name,
    title: hero.title,
    roleType: override?.roleType || hero.roleType,
    heroType: hero.heroType,
    heroType2: hero.heroType2,
    imageUrl: hero.imageUrl,
    skinsJson: hero.skinsJson,
    skills: JSON.parse(hero.skillsJson || "[]"),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const heroId = parseInt(params.id);
  if (!heroId) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  const { roleType } = await req.json();
  if (!roleType || !["top", "jungle", "mid", "adc", "support"].includes(roleType)) {
    return NextResponse.json({ error: "无效分路" }, { status: 400 });
  }

  // Write to overrides table (survives external syncs)
  await prisma.heroLaneOverride.upsert({
    where: { heroId },
    create: { heroId, roleType },
    update: { roleType },
  });

  const hero = await prisma.hero.findUnique({
    where: { heroId },
    select: { heroId: true, name: true, roleType: true, heroType: true, heroType2: true },
  });

  return NextResponse.json({ ...hero, roleType });
}
