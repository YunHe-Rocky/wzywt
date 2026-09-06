export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { executeTournamentSplit } from "@/features/tournaments/server/split-use-case";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireAuth } from "@/lib/auth";
import { parseRouteId } from "@/lib/request-validation";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const [{ id }, user] = await Promise.all([props.params, requireAuth()]);
    const result = await executeTournamentSplit(parseRouteId(id, "赛事 ID"), user.userId);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, { request, useCase: "tournament.split", startedAt });
  }
}