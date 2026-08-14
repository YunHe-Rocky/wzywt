export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isMatchSide } from "@/features/matches/model";
import { deleteTacticLayer, updateTacticLayer } from "@/features/tactics/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";

type Context = { params: Promise<{ id: string; matchId: string; side: string; layerId: string }> };

async function parseContext(context: Context) {
  const params = await context.params;
  if (!isMatchSide(params.side)) throw new ServiceError("VALIDATION_ERROR", "战术阵营无效");
  return { tournamentId: parseRouteId(params.id, "赛事 ID"), matchId: parseRouteId(params.matchId, "比赛 ID"), side: params.side, layerId: parseRouteId(params.layerId, "图层 ID") };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const ids = await parseContext(context);
    return NextResponse.json(await updateTacticLayer(ids.tournamentId, ids.matchId, ids.side, ids.layerId, await readJsonRequest(request)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const ids = await parseContext(context);
    const body = await readJsonRequest(request);
    const expectedUpdatedAt = typeof body === "object" && body !== null && "expectedUpdatedAt" in body ? body.expectedUpdatedAt : undefined;
    return NextResponse.json(await deleteTacticLayer(ids.tournamentId, ids.matchId, ids.side, ids.layerId, expectedUpdatedAt));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
