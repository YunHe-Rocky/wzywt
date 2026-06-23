import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const prefs = await prisma.rolePreference.findMany({
    where: { userId },
    orderBy: { preferenceRank: "asc" },
  });

  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { preferences } = await req.json();
  if (!preferences || preferences.length !== 5) {
    return NextResponse.json({ error: "必须为全部5个分路设置偏好" }, { status: 400 });
  }

  await prisma.$transaction(
    preferences.map((p: { role_type: string; preference_rank: number }) =>
      prisma.rolePreference.upsert({
        where: { userId_roleType: { userId, roleType: p.role_type } },
        update: { preferenceRank: p.preference_rank },
        create: { userId, roleType: p.role_type, preferenceRank: p.preference_rank },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
