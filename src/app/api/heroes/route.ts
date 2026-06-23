import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roleType = searchParams.get("role_type");
  const heroType = searchParams.get("hero_type");
  const where: Record<string, unknown> = {};
  if (roleType) where.roleType = roleType;
  if (heroType) where.heroType = Number(heroType);
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
    },
  });
  return NextResponse.json(heroes);
}
