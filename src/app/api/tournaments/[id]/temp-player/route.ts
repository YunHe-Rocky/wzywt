import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import {
  addTemporaryTournamentPlayer,
  TournamentCapacityError,
} from "@/features/tournaments/server/capacity";
import { tryParseRouteId, tryReadJsonRequest } from "@/lib/request-validation";
import { apiErrorResponse } from "@/lib/api-errors";
import { addTemporaryPlayerHeroPowers } from "@/features/tournaments/server/management";

async function handlePOST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
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

async function handlePUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
  const body = await tryReadJsonRequest<{ targetUserId?: unknown; heroPowers?: unknown }>(req);
  if (!body.ok) return body.response;
  try {
    await addTemporaryPlayerHeroPowers(tournamentId, userId, body.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, { request: req, useCase: "tournaments.temporary-player.powers" });
  }
}

export const POST = withRequestCapacity(handlePOST);
export const PUT = withRequestCapacity(handlePUT);
