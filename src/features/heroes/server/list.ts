import { CLASS_LABELS, ROLE_LABELS } from "@/core/game";
import { prisma } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function listHeroes(filters: { roleType?: string | null; heroType?: string | null } = {}) {
  const canCache = !filters.roleType && !filters.heroType;
  if (canCache) {
    const cached = await cacheGet<Array<Record<string, unknown>>>("heroes", "list:v2");
    if (cached) return cached;
  }

  const heroes = await prisma.hero.findMany({
    where: filters.heroType ? { heroType: Number(filters.heroType) } : {},
    orderBy: { heroId: "asc" },
    select: {
      heroId: true, name: true, title: true, roleType: true, heroType: true,
      heroType2: true, imageUrl: true, mingge: true, minggeName: true, minggeRelatedId: true,
    },
  });
  const [overrides, secondaryLanes] = await Promise.all([
    prisma.heroLaneOverride.findMany(),
    prisma.heroSecondaryLane.findMany({ orderBy: { id: "asc" } }),
  ]);
  const overrideMap = new Map(overrides.map((override) => [override.heroId, override.roleType]));
  const secondaryMap = new Map<number, string[]>();
  for (const lane of secondaryLanes) {
    const lanes = secondaryMap.get(lane.heroId) ?? [];
    lanes.push(lane.roleType);
    secondaryMap.set(lane.heroId, lanes);
  }

  const merged = heroes.map((hero) => {
    const roleType = overrideMap.get(hero.heroId) || hero.roleType;
    const secondaryRoleTypes = (secondaryMap.get(hero.heroId) ?? []).filter((lane) => lane !== roleType);
    const tags: string[] = [];
    if (ROLE_LABELS[roleType]) tags.push(ROLE_LABELS[roleType]);
    for (const lane of secondaryRoleTypes) if (ROLE_LABELS[lane]) tags.push(`兼${ROLE_LABELS[lane]}`);
    if (CLASS_LABELS[hero.heroType]) tags.push(CLASS_LABELS[hero.heroType]);
    if (hero.mingge) tags.push("命格");
    return {
      id: hero.heroId,
      name: hero.name,
      meta: {
        title: hero.title, roleType, secondaryRoleTypes, heroType: hero.heroType,
        heroType2: hero.heroType2, imageUrl: hero.imageUrl,
        mingge: hero.mingge ? { name: hero.minggeName, relatedId: hero.minggeRelatedId } : null,
      },
      tags,
      heroId: hero.heroId,
      title: hero.title,
      roleType,
      secondaryRoleTypes,
      heroType: hero.heroType,
      heroType2: hero.heroType2,
      imageUrl: hero.imageUrl,
      mingge: hero.mingge,
      minggeName: hero.minggeName,
      minggeRelatedId: hero.minggeRelatedId,
    };
  });
  const result = filters.roleType
    ? merged.filter((hero) => hero.roleType === filters.roleType || hero.secondaryRoleTypes.includes(filters.roleType!))
    : merged;
  if (canCache) await cacheSet("heroes", "list:v2", result, 3600);
  return result;
}
