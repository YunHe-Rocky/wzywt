export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { ROLE_LABELS, CLASS_LABELS } from "@/core/game";
import { queueHeroSync } from "@/features/heroes/server/sync-jobs";
import { apiErrorResponse } from "@/lib/api-errors";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roleTypeFilter = searchParams.get("role_type");
  const heroTypeFilter = searchParams.get("hero_type");

  // Try Redis cache (only when no filters)
  const canCache = !roleTypeFilter && !heroTypeFilter;
  if (canCache) {
    const cached = await cacheGet("heroes", "list:v2");
    if (cached) {
      const body = cached as Array<Record<string, unknown>>;
      return NextResponse.json(body);
    }
  }

  const where: Record<string, unknown> = {};
  if (heroTypeFilter) where.heroType = Number(heroTypeFilter);

  const heroes = await prisma.hero.findMany({
    where,
    orderBy: { heroId: "asc" },
    select: {
      heroId: true,
      name: true,
      title: true,
      roleType: true,
      heroType: true,
      heroType2: true,
      imageUrl: true,
      mingge: true,
      minggeName: true,
      minggeRelatedId: true,
    },
  });

  const [overrides, secondaryLanes] = await Promise.all([
    prisma.heroLaneOverride.findMany(),
    prisma.heroSecondaryLane.findMany({ orderBy: { id: "asc" } }),
  ]);
  const overrideMap = new Map(overrides.map((o) => [o.heroId, o.roleType]));
  const secondaryMap = new Map<number, string[]>();
  for (const lane of secondaryLanes) {
    const lanes = secondaryMap.get(lane.heroId) ?? [];
    lanes.push(lane.roleType);
    secondaryMap.set(lane.heroId, lanes);
  }

  const merged = heroes.map((h) => {
    const roleType = overrideMap.get(h.heroId) || h.roleType;
    const secondaryRoleTypes = (secondaryMap.get(h.heroId) ?? []).filter((lane) => lane !== roleType);
    const tags: string[] = [];
    if (ROLE_LABELS[roleType]) tags.push(ROLE_LABELS[roleType]);
    for (const lane of secondaryRoleTypes) {
      if (ROLE_LABELS[lane]) tags.push(`兼${ROLE_LABELS[lane]}`);
    }
    if (CLASS_LABELS[h.heroType]) tags.push(CLASS_LABELS[h.heroType]);
    if (h.mingge) tags.push("命格");
    return {
      id: h.heroId,
      name: h.name,
      meta: {
        title: h.title,
        roleType,
        secondaryRoleTypes,
        heroType: h.heroType,
        heroType2: h.heroType2,
        imageUrl: h.imageUrl,
        mingge: h.mingge ? { name: h.minggeName, relatedId: h.minggeRelatedId } : null,
      },
      tags,
      // backwards compat
      heroId: h.heroId,
      title: h.title,
      roleType,
      secondaryRoleTypes,
      heroType: h.heroType,
      heroType2: h.heroType2,
      imageUrl: h.imageUrl,
      mingge: h.mingge,
      minggeName: h.minggeName,
      minggeRelatedId: h.minggeRelatedId,
    };
  });

  if (roleTypeFilter) {
    return NextResponse.json(merged.filter(
      (h) => h.roleType === roleTypeFilter || h.secondaryRoleTypes.includes(roleTypeFilter),
    ));
  }

  // Cache unfiltered list
  await cacheSet("heroes", "list:v2", merged, 3600);

  return NextResponse.json(merged);
}

export async function POST(req: NextRequest) {
  try {
    const authorization = await authorizeSuperAdmin();
    const userId = authorization.ok ? authorization.user.userId : 0;
    if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });
    const progress = await queueHeroSync(userId);
    return NextResponse.json({ ok: true, jobId: progress.jobId, message: progress.message }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
