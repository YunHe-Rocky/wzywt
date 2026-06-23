import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roleType = searchParams.get("role_type");
  const where = roleType ? { roleType } : {};
  const heroes = await prisma.hero.findMany({ where, orderBy: { heroId: "asc" } });
  return NextResponse.json(heroes.map((h) => ({
    ...h,
    skills: JSON.parse(h.skillsJson),
  })));
}
