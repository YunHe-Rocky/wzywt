import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roleTypeFilter = searchParams.get("role_type");
  const heroTypeFilter = searchParams.get("hero_type");
  const where: Record<string, unknown> = {};
  if (heroTypeFilter) where.heroType = Number(heroTypeFilter);

  // Fetch all heroes first (roleType filter applied after override merge)
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
    },
  });

  // Merge manual lane overrides (survives external sync)
  const overrides = await prisma.heroLaneOverride.findMany();
  const overrideMap = new Map(overrides.map((o) => [o.heroId, o.roleType]));

  const merged = heroes.map((h) => ({
    ...h,
    roleType: overrideMap.get(h.heroId) || h.roleType,
  }));

  if (roleTypeFilter) {
    return NextResponse.json(merged.filter((h) => h.roleType === roleTypeFilter));
  }
  return NextResponse.json(merged);
}
