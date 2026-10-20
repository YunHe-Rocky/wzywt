import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getCombatVideoPolicy } from "@/features/combat-posts/server/video-policy";
import { requireAuth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { assertVideoRuntime } from "@/lib/video-normalization";
async function handleGET() {
  try { await requireAuth(); await assertVideoRuntime(); return NextResponse.json(getCombatVideoPolicy(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiErrorResponse(error); }
}

export const GET = withRequestCapacity(handleGET);
