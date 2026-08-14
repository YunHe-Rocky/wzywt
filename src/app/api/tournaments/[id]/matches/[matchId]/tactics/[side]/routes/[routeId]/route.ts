export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isMatchSide } from "@/features/matches/model";
import { deleteOwnTacticRoute } from "@/features/tactics/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";

type Context = { params: Promise<{ id: string; matchId: string; side: string; routeId: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    if (!isMatchSide(params.side)) throw new ServiceError("VALIDATION_ERROR", "战术阵营无效");
    const body = await readJsonRequest(request);
    const expectedRevision = typeof body === "object" && body !== null && "expectedRevision" in body ? body.expectedRevision : undefined;
    return NextResponse.json(await deleteOwnTacticRoute(parseRouteId(params.id, "赛事 ID"), parseRouteId(params.matchId, "比赛 ID"), params.side, parseRouteId(params.routeId, "路线 ID"), expectedRevision));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
