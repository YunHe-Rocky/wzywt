export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cancelMatchRecognition, startMatchRecognition } from "@/features/matches/server/recognition";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId } from "@/lib/request-validation";

type Context = { params: Promise<{ id: string; matchId: string }> };

export async function POST(_request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    const task = await startMatchRecognition(parseRouteId(params.id, "赛事 ID"), parseRouteId(params.matchId, "比赛 ID"));
    return NextResponse.json(task, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    return NextResponse.json(await cancelMatchRecognition(parseRouteId(params.id, "赛事 ID"), parseRouteId(params.matchId, "比赛 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
