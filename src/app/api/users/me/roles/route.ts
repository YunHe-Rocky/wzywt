export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { normalizeRolePreferenceSettings } from "@/features/profile/model";

export async function GET() {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const prefs = await prisma.rolePreference.findMany({
    where: { userId },
    orderBy: { preferenceRank: "asc" },
  });

  return NextResponse.json({
    preferences: normalizeRolePreferenceSettings(prefs),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { preferences } = await req.json();
  if (!Array.isArray(preferences) || preferences.length !== 5) {
    return NextResponse.json({ error: "必须为全部5个分路设置偏好" }, { status: 400 });
  }

  const normalized = normalizeRolePreferenceSettings(
    preferences.map((p: { role_type: string; preference_rank: number; role_rank?: number; peak_score?: number; peak_rank?: number }) => ({
      roleType: p.role_type,
      preferenceRank: p.preference_rank,
      roleRank: p.role_rank ?? 0,
      peakScore: p.peak_score ?? 0,
      peakRank: p.peak_rank ?? 0,
    })),
  );

  await prisma.$transaction(
    normalized.map((p) =>
      prisma.rolePreference.upsert({
        where: { userId_roleType: { userId, roleType: p.roleType } },
        update: {
          preferenceRank: p.preferenceRank,
          roleRank: p.roleRank,
          peakScore: p.peakScore,
          peakRank: p.peakRank,
        },
        create: {
          userId,
          roleType: p.roleType,
          preferenceRank: p.preferenceRank,
          roleRank: p.roleRank,
          peakScore: p.peakScore,
          peakRank: p.peakRank,
        },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
