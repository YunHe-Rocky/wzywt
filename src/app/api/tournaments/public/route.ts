import { NextResponse } from "next/server";
import { listPublicTournaments } from "@/features/tournaments/server/list";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournaments = await listPublicTournaments(6);

  return NextResponse.json({ tournaments }, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
