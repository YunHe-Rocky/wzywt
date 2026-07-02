export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { broadcastHeroUpdate } from "@/lib/sse/heroes";
import { cacheGet, cacheSet } from "@/lib/redis";
import { ROLE_LABELS, CLASS_LABELS } from "@/engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const heroId = parseInt(params.id);
  if (!heroId) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  // Try Redis cache
  const cached = await cacheGet("hero", heroId);
  if (cached) return NextResponse.json(cached);

  const hero = await prisma.hero.findUnique({ where: { heroId } });
  if (!hero) return NextResponse.json({ error: "英雄不存在" }, { status: 404 });

  // Fetch skills from hero_skills table (fallback to JSON for migration period)
  let skills = await prisma.heroSkill.findMany({
    where: { heroId },
    orderBy: { skillIndex: "asc" },
    select: { name: true, cd: true, cost: true, desc: true, damageType: true, skillIndex: true, extraJson: true },
  });

  // Fallback: use old skillsJson if hero_skills is empty (migration not yet run)
  if (skills.length === 0 && hero.skillsJson) {
    try {
      const legacy = JSON.parse(hero.skillsJson);
      skills = (Array.isArray(legacy) ? legacy : []).map((s: Record<string, unknown>, i: number) => ({
        name: String(s.name || ""),
        cd: String(s.cd || ""),
        cost: String(s.cost || ""),
        desc: String(s.desc || ""),
        damageType: null as string | null,
        skillIndex: i,
        extraJson: null as any,
      }));
    } catch { /* ignore */ }
  }

  const override = await prisma.heroLaneOverride.findUnique({ where: { heroId } });

  const roleType = override?.roleType || hero.roleType;

  // 统一 extraJson（与装备 API 对齐）
  const tags: string[] = [];
  if (ROLE_LABELS[roleType]) tags.push(ROLE_LABELS[roleType]);
  if (CLASS_LABELS[hero.heroType]) tags.push(CLASS_LABELS[hero.heroType]);
  if (hero.mingge) tags.push("命格");

  const result = {
    id: hero.heroId,
    name: hero.name,
    meta: {
      title: hero.title,
      roleType,
      heroType: hero.heroType,
      heroType2: hero.heroType2,
      imageUrl: hero.imageUrl,
      skinsJson: hero.skinsJson,
      mingge: hero.mingge ? { name: hero.minggeName, relatedId: hero.minggeRelatedId } : null,
    },
    tags,
    baseJson: hero.baseJson,
    stats: [] as { stat: string; value: number }[],
    effects: skills.flatMap((s: any) =>
      (s.extraJson?.damage || []).map((d: any) => ({
        skillIndex: s.skillIndex,
        skillName: s.name,
        ...d,
      }))
    ),
    skills,
    // backwards compat
    heroId: hero.heroId,
    id_db: hero.id,
    title: hero.title,
    roleType,
    heroType: hero.heroType,
    heroType2: hero.heroType2,
    imageUrl: hero.imageUrl,
    skinsJson: hero.skinsJson,
    mingge: hero.mingge,
    minggeName: hero.minggeName,
    minggeRelatedId: hero.minggeRelatedId,
  };

  void cacheSet("hero", heroId, result, 3600);

  return NextResponse.json(result);
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

  // Broadcast to all connected clients so they refresh immediately
  broadcastHeroUpdate([{ heroId, name: hero?.name }]);

  return NextResponse.json({ ...hero, roleType });
}
