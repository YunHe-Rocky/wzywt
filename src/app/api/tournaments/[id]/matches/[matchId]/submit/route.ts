export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { submitMatch } from "@/features/matches/server/records";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";

type Context = { params: Promise<{ id: string; matchId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    return NextResponse.json(await submitMatch(parseRouteId(params.id, "赛事 ID"), parseRouteId(params.matchId, "比赛 ID"), await readJsonRequest(request)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
