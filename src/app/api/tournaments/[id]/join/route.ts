import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { tryParseRouteId } from "@/lib/request-validation";
import {
  addRegisteredTournamentPlayer,
  TournamentCapacityError,
} from "@/features/tournaments/server/capacity";

async function handlePOST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
  try {
    const player = await addRegisteredTournamentPlayer(tournamentId, userId);
    return NextResponse.json({ player });
  } catch (error) {
    if (error instanceof TournamentCapacityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = withRequestCapacity(handlePOST);
