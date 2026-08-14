export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isMatchSide } from "@/features/matches/model";
import { saveOwnTacticRoute } from "@/features/tactics/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";

type Context = { params: Promise<{ id: string; matchId: string; side: string; layerId: string }> };

export async function PUT(request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    if (!isMatchSide(params.side)) throw new ServiceError("VALIDATION_ERROR", "战术阵营无效");
    return NextResponse.json({ route: await saveOwnTacticRoute(parseRouteId(params.id, "赛事 ID"), parseRouteId(params.matchId, "比赛 ID"), params.side, parseRouteId(params.layerId, "图层 ID"), await readJsonRequest(request)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
