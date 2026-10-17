import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { tryParseRouteId, tryReadJsonRequest } from "@/lib/request-validation";
import { apiErrorResponse } from "@/lib/api-errors";
import { manageTournamentAdministrator } from "@/features/tournaments/server/management";

async function handlePOST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
  const body = await tryReadJsonRequest<{ targetUserId?: unknown; action?: unknown }>(req);
  if (!body.ok) return body.response;
  try {
    await manageTournamentAdministrator(tournamentId, userId, body.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, { request: req, useCase: "tournaments.admin.update" });
  }
}

export const POST = withRequestCapacity(handlePOST);
