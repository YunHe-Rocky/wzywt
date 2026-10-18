import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { requireAuth } from "@/lib/auth";
import { parseRouteId } from "@/lib/request-validation";
import { apiErrorResponse } from "@/lib/api-errors";
import { leaveTournament } from "@/features/tournaments/server/leave";
export const dynamic = "force-dynamic";
export const POST = withRequestCapacity(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  try {
    const user = await requireAuth();
    const id = parseRouteId((await props.params).id, "赛事 ID");
    await leaveTournament(id, user.userId);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiErrorResponse(error, { request: req, useCase: "tournaments.leave" }); }
});
