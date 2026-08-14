export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import {
  addTemporaryTournamentPlayer,
  TournamentCapacityError,
} from "@/features/tournaments/server/capacity";
import { tryReadJsonRequest } from "@/lib/request-validation";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const body = await tryReadJsonRequest<{ tempName?: unknown }>(req);
  if (!body.ok) return body.response;
  const { tempName } = body.value;
  if (tempName !== undefined && (typeof tempName !== "string" || tempName.trim().length > 32)) {
    return NextResponse.json({ error: "临时选手名称不能超过32个字符" }, { status: 400 });
  }

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员操作" }, { status: 403 });

  try {
    const player = await addTemporaryTournamentPlayer({ tournamentId, tempName });
    return NextResponse.json({ player });
  } catch (error) {
    if (error instanceof TournamentCapacityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const body = await tryReadJsonRequest<{ targetUserId?: unknown; heroPowers?: unknown }>(req);
  if (!body.ok) return body.response;
  const { targetUserId, heroPowers } = body.value;
  if (typeof targetUserId !== "number" || !Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: "目标用户无效" }, { status: 400 });
  }

  // Admin or original applicant can fill temp player data
  const isAdmin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可为临时人员补填资料" }, { status: 403 });
  }

  if (heroPowers && Array.isArray(heroPowers)) {
    for (const hp of heroPowers) {
      await prisma.heroPower.create({
        data: { userId: targetUserId, roleType: hp.roleType, heroId: hp.heroId, heroName: hp.heroName || "", powerScore: hp.powerScore },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
