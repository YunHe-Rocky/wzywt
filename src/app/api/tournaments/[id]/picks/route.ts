import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { requireAuth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, tryReadJsonRequest } from "@/lib/request-validation";
import { getTournamentPicksForUser, saveTournamentPick } from "@/features/tournaments/server/picks";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
export const GET = withRequestCapacity(async (req: NextRequest, props: Props) => {
  try { const user = await requireAuth(); const id = parseRouteId((await props.params).id, "赛事 ID");
    return NextResponse.json({ picks: await getTournamentPicksForUser(id, user.userId) });
  } catch (error) { return apiErrorResponse(error, { request: req, useCase: "tournaments.picks.list" }); }
});
export const PUT = withRequestCapacity(async (req: NextRequest, props: Props) => {
  try { const user = await requireAuth(); const id = parseRouteId((await props.params).id, "赛事 ID");
    const body = await tryReadJsonRequest<Record<string, unknown>>(req); if (!body.ok) return body.response;
    await saveTournamentPick(id, user.userId, body.value); return NextResponse.json({ ok: true });
  } catch (error) { return apiErrorResponse(error, { request: req, useCase: "tournaments.picks.save" }); }
});
