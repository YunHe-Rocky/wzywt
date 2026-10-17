import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { confirmMatchPlayers } from "@/features/matches/server/records";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";

type Context = { params: Promise<{ id: string; matchId: string }> };

async function handlePUT(request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    return NextResponse.json(await confirmMatchPlayers(parseRouteId(params.id, "赛事 ID"), parseRouteId(params.matchId, "比赛 ID"), await readJsonRequest(request, 512 * 1024)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const PUT = withRequestCapacity(handlePUT);
