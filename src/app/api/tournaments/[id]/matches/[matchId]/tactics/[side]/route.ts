export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isMatchSide } from "@/features/matches/model";
import { createTacticLayer, getTacticRoom } from "@/features/tactics/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";

type Context = { params: Promise<{ id: string; matchId: string; side: string }> };

async function parseContext(context: Context) {
  const params = await context.params;
  if (!isMatchSide(params.side)) throw new ServiceError("VALIDATION_ERROR", "战术阵营无效");
  return { tournamentId: parseRouteId(params.id, "赛事 ID"), matchId: parseRouteId(params.matchId, "比赛 ID"), side: params.side };
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const ids = await parseContext(context);
    return NextResponse.json(await getTacticRoom(ids.tournamentId, ids.matchId, ids.side));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const ids = await parseContext(context);
    return NextResponse.json({ layer: await createTacticLayer(ids.tournamentId, ids.matchId, ids.side, await readJsonRequest(request)) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
