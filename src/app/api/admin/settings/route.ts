import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { tryReadJsonRequest } from "@/lib/request-validation";
import { apiErrorResponse } from "@/lib/api-errors";
import { readAdminCrawlSettings, saveAdminCrawlSettings } from "@/features/admin/server/settings";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    const authorization = await authorizeSuperAdmin();
    if (!authorization.ok) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json(await readAdminCrawlSettings());
  } catch (cause) { return apiErrorResponse(cause); }
}
async function handlePUT(request: NextRequest) {
  try {
    const authorization = await authorizeSuperAdmin();
    if (!authorization.ok) return NextResponse.json({ error: "无权限" }, { status: 403 });
    const parsed = await tryReadJsonRequest<unknown>(request);
    if (!parsed.ok) return parsed.response;
    return NextResponse.json(await saveAdminCrawlSettings(parsed.value));
  } catch (cause) { return apiErrorResponse(cause); }
}
export const GET = withRequestCapacity(handleGET);
export const PUT = withRequestCapacity(handlePUT);
