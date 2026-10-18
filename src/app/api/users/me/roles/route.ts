import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { requireAuth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { tryReadJsonRequest } from "@/lib/request-validation";
import { listRolePreferences, saveRolePreferences } from "@/features/profile/server/preferences";
export const dynamic = "force-dynamic";
export const GET = withRequestCapacity(async (req: NextRequest) => {
  try { const user = await requireAuth(); return NextResponse.json({ preferences: await listRolePreferences(user.userId) }); }
  catch (error) { return apiErrorResponse(error, { request: req, useCase: "profile.roles.get" }); }
});
export const PUT = withRequestCapacity(async (req: NextRequest) => {
  try { const user = await requireAuth(); const body = await tryReadJsonRequest<{ preferences?: unknown }>(req); if (!body.ok) return body.response; await saveRolePreferences(user.userId, body.value.preferences); return NextResponse.json({ ok: true }); }
  catch (error) { return apiErrorResponse(error, { request: req, useCase: "profile.roles.put" }); }
});
