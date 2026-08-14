export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isMatchSide } from "@/features/matches/model";
import { deleteOwnTacticMarker, updateOwnTacticMarker } from "@/features/tactics/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";

type Context = { params: Promise<{ id: string; matchId: string; side: string; markerId: string }> };

async function parseContext(context: Context) {
  const params = await context.params;
  if (!isMatchSide(params.side)) throw new ServiceError("VALIDATION_ERROR", "战术阵营无效");
  return { tournamentId: parseRouteId(params.id, "赛事 ID"), matchId: parseRouteId(params.matchId, "比赛 ID"), side: params.side, markerId: parseRouteId(params.markerId, "点位 ID") };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const ids = await parseContext(context);
    return NextResponse.json(await updateOwnTacticMarker(ids.tournamentId, ids.matchId, ids.side, ids.markerId, await readJsonRequest(request)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const ids = await parseContext(context);
    const body = await readJsonRequest(request);
    const expectedRevision = typeof body === "object" && body !== null && "expectedRevision" in body ? body.expectedRevision : undefined;
    return NextResponse.json(await deleteOwnTacticMarker(ids.tournamentId, ids.matchId, ids.side, ids.markerId, expectedRevision));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
