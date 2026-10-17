import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { listAdminCombatPosts } from "@/features/admin/server/combat-posts";
import { apiErrorResponse } from "@/lib/api-errors";

async function handleGET(request: NextRequest) {
  try { return NextResponse.json(await listAdminCombatPosts(request.nextUrl.searchParams)); }
  catch (error) { return apiErrorResponse(error); }
}

export const GET = withRequestCapacity(handleGET);
