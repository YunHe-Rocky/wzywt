import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const hero = await prisma.hero.findUnique({ where: { heroId: parseInt(params.id) } });
  if (!hero) return NextResponse.json({ error: "英雄不存在" }, { status: 404 });
  return NextResponse.json({ ...hero, skills: JSON.parse(hero.skillsJson) });
}
