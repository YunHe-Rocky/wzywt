export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { correctMatchRecord } from "@/features/matches/server/records";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";

type Context = { params: Promise<{ matchId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { matchId } = await context.params;
    return NextResponse.json(await correctMatchRecord(parseRouteId(matchId, "比赛 ID"), await readJsonRequest(request)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
