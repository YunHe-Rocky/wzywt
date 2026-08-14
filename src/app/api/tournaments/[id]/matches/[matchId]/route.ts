export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getMatchDetail } from "@/features/matches/server/draft";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId } from "@/lib/request-validation";

type Context = { params: Promise<{ id: string; matchId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    return NextResponse.json(await getMatchDetail(parseRouteId(params.id, "赛事 ID"), parseRouteId(params.matchId, "比赛 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
