export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { broadcastHeroUpdate } from "@/features/heroes/server/events";
import { cacheDel, cacheGet, cacheSet } from "@/lib/redis";
import { ROLE_LABELS, CLASS_LABELS, ROLES } from "@/core/game";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const heroId = parseInt(params.id);
  if (!heroId) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  // Try Redis cache
  const cached = await cacheGet("hero:v2", heroId);
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

  const [override, secondaryLanes] = await Promise.all([
    prisma.heroLaneOverride.findUnique({ where: { heroId } }),
    prisma.heroSecondaryLane.findMany({ where: { heroId }, orderBy: { id: "asc" } }),
  ]);

  const roleType = override?.roleType || hero.roleType;
  const secondaryRoleTypes = secondaryLanes
    .map((lane) => lane.roleType)
    .filter((lane) => lane !== roleType);

  // 统一 extraJson（与装备 API 对齐）
  const tags: string[] = [];
  if (ROLE_LABELS[roleType]) tags.push(ROLE_LABELS[roleType]);
  for (const lane of secondaryRoleTypes) {
    if (ROLE_LABELS[lane]) tags.push(`兼${ROLE_LABELS[lane]}`);
  }
  if (CLASS_LABELS[hero.heroType]) tags.push(CLASS_LABELS[hero.heroType]);
  if (hero.mingge) tags.push("命格");

  const result = {
    id: hero.heroId,
    name: hero.name,
    meta: {
      title: hero.title,
      roleType,
      secondaryRoleTypes,
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
    secondaryRoleTypes,
    heroType: hero.heroType,
    heroType2: hero.heroType2,
    imageUrl: hero.imageUrl,
    skinsJson: hero.skinsJson,
    mingge: hero.mingge,
    minggeName: hero.minggeName,
    minggeRelatedId: hero.minggeRelatedId,
  };

  void cacheSet("hero:v2", heroId, result, 3600);

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "仅 admin 可修改英雄分路" }, { status: 403 });

  const heroId = parseInt(params.id);
  if (!heroId) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  const body = await req.json().catch(() => null) as {
    roleType?: unknown;
    secondaryRoleTypes?: unknown;
  } | null;
  const roleType = body?.roleType;
  const secondaryRoleTypes = body?.secondaryRoleTypes;
  if (typeof roleType !== "string" || !ROLES.includes(roleType as (typeof ROLES)[number])) {
    return NextResponse.json({ error: "无效分路" }, { status: 400 });
  }
  if (
    !Array.isArray(secondaryRoleTypes)
    || secondaryRoleTypes.some((lane) => typeof lane !== "string" || !ROLES.includes(lane as (typeof ROLES)[number]))
  ) {
    return NextResponse.json({ error: "无效附属分路" }, { status: 400 });
  }
  const normalizedSecondary = Array.from(new Set(secondaryRoleTypes as string[]))
    .filter((lane) => lane !== roleType);

  const exists = await prisma.hero.findUnique({ where: { heroId }, select: { heroId: true } });
  if (!exists) return NextResponse.json({ error: "英雄不存在" }, { status: 404 });

  // 主/附属分路同事务写入，避免并发读取到冲突状态。
  await prisma.$transaction(async (tx) => {
    await tx.heroLaneOverride.upsert({
      where: { heroId },
      create: { heroId, roleType },
      update: { roleType },
    });
    await tx.heroSecondaryLane.deleteMany({ where: { heroId } });
    if (normalizedSecondary.length > 0) {
      await tx.heroSecondaryLane.createMany({
        data: normalizedSecondary.map((lane) => ({ heroId, roleType: lane })),
      });
    }
  });

  const hero = await prisma.hero.findUnique({
    where: { heroId },
    select: { heroId: true, name: true, roleType: true, heroType: true, heroType2: true },
  });

  // Broadcast to all connected clients so they refresh immediately
  broadcastHeroUpdate([{ heroId, name: hero?.name }]);
  await Promise.all([
    cacheDel("heroes", "list:v2"),
    cacheDel("hero:v2", heroId),
  ]);

  return NextResponse.json({ ...hero, roleType, secondaryRoleTypes: normalizedSecondary });
}
