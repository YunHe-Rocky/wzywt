import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createMatchDraft, listTournamentMatches } from "@/features/matches/server/draft";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";

type Context = { params: Promise<{ id: string }> };

async function handleGET(_request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ matches: await listTournamentMatches(parseRouteId(id, "赛事 ID")) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function handlePOST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const body = await readJsonRequest(request);
    const playedAt = typeof body === "object" && body !== null && "playedAt" in body ? body.playedAt : undefined;
    return NextResponse.json({ match: await createMatchDraft(parseRouteId(id, "赛事 ID"), playedAt) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const GET = withRequestCapacity(handleGET);
export const POST = withRequestCapacity(handlePOST);
