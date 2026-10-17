import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { getTournamentPicksForUser } from "@/features/tournaments/server/picks";
import { tryParseRouteId, tryReadJsonRequest } from "@/lib/request-validation";

const VALID_ROLES = ["top", "jungle", "mid", "adc", "support"];

// GET 获取两队选人数据
async function handleGET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
  try {
    return NextResponse.json({ picks: await getTournamentPicksForUser(tournamentId, auth.user.userId) });
  } catch (error) {
    return apiErrorResponse(error, { request: _req, useCase: "tournaments.picks.list" });
  }
}

// PUT 保存选人
async function handlePUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;

  // Check admin or the player themselves
  const isAdmin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  const isPlayer = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId, userId, isSpectator: false, isTemporary: false },
  });

  if (!isAdmin && !isPlayer) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await tryReadJsonRequest<Record<string, unknown>>(req);
  if (!body.ok) return body.response;
  const { heroId, equipIds, team, roleType, targetUserId: bodyTarget } = body.value;
  if (heroId !== undefined && (typeof heroId !== "number" || !Number.isSafeInteger(heroId) || heroId <= 0)) {
    return NextResponse.json({ error: "英雄参数无效" }, { status: 400 });
  }
  if (equipIds !== undefined && (!Array.isArray(equipIds) || equipIds.some((id) => !Number.isSafeInteger(id) || id <= 0))) {
    return NextResponse.json({ error: "装备参数无效" }, { status: 400 });
  }
  if (team !== undefined && team !== "red" && team !== "blue") {
    return NextResponse.json({ error: "队伍参数无效" }, { status: 400 });
  }
  if (roleType !== undefined && (typeof roleType !== "string" || (roleType && !VALID_ROLES.includes(roleType)))) {
    return NextResponse.json({ error: "无效分路" }, { status: 400 });
  }
  if (bodyTarget !== undefined && (typeof bodyTarget !== "number" || !Number.isSafeInteger(bodyTarget) || bodyTarget <= 0)) {
    return NextResponse.json({ error: "目标用户无效" }, { status: 400 });
  }

  // Only admins can set other players' picks
  const targetUserId = isAdmin && typeof bodyTarget === "number" ? bodyTarget : userId;

  // Validate hero belongs to the assigned role
  if (typeof heroId === "number") {
    const hero = await prisma.hero.findUnique({ where: { heroId } });
    if (!hero) return NextResponse.json({ error: "英雄不存在" }, { status: 400 });

    // Check role restriction
    if (typeof roleType === "string" && roleType && !VALID_ROLES.includes(roleType)) {
      return NextResponse.json({ error: "无效分路" }, { status: 400 });
    }
  }

  // Get existing pick
  const existing = await prisma.tournamentPick.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
  });

  const data = {
    tournamentId,
    userId: targetUserId,
    team: typeof team === "string" ? team : existing?.team || "red",
    roleType: typeof roleType === "string" ? roleType : existing?.roleType || "",
    heroId: typeof heroId === "number" ? heroId : existing?.heroId || 0,
    equipJson: Array.isArray(equipIds) ? equipIds : existing?.equipJson || [],
  };

  if (existing) {
    await prisma.tournamentPick.update({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      data: { heroId: data.heroId, equipJson: data.equipJson, team: data.team, roleType: data.roleType },
    });
  } else {
    if (typeof heroId !== "number") return NextResponse.json({ error: "请先选择英雄" }, { status: 400 });
    await prisma.tournamentPick.create({ data });
  }

  return NextResponse.json({ ok: true });
}

export const GET = withRequestCapacity(handleGET);
export const PUT = withRequestCapacity(handlePUT);
