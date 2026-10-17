import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAdminOverview } from "@/features/admin/server/overview";
import { apiErrorResponse } from "@/lib/api-errors";
async function handleGET() {
  try { return NextResponse.json(await getAdminOverview()); }
  catch (error) { return apiErrorResponse(error); }
}

export const GET = withRequestCapacity(handleGET);
