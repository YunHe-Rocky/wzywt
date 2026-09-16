export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { listAdminCombatPosts } from "@/features/admin/server/combat-posts";
import { apiErrorResponse } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listAdminCombatPosts(request.nextUrl.searchParams)); }
  catch (error) { return apiErrorResponse(error); }
}
