export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAdminOverview } from "@/features/admin/server/overview";
import { apiErrorResponse } from "@/lib/api-errors";
export async function GET() {
  try { return NextResponse.json(await getAdminOverview()); }
  catch (error) { return apiErrorResponse(error); }
}
