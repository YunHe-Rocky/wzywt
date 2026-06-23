import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

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

  const updated = await prisma.hero.update({
    where: { heroId },
    data: { roleType },
    select: { heroId: true, name: true, roleType: true, heroType: true, heroType2: true },
  });

  return NextResponse.json(updated);
}
