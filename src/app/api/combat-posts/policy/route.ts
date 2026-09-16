export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getCombatVideoPolicy } from "@/features/combat-posts/server/video-policy";
import { requireAuth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
export async function GET() {
  try { await requireAuth(); return NextResponse.json(getCombatVideoPolicy(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiErrorResponse(error); }
}
