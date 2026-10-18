import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { requireAuth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { tryReadJsonRequest, parseRouteId } from "@/lib/request-validation";
import { listHeroPowers, addHeroPower, removeHeroPower } from "@/features/profile/server/preferences";
export const dynamic = "force-dynamic";
export const GET = withRequestCapacity(async (req: NextRequest) => {
  try { const user = await requireAuth(); return NextResponse.json({ heroPowers: await listHeroPowers(user.userId) }); }
  catch (error) { return apiErrorResponse(error, { request: req, useCase: "profile.heroes.get" }); }
});
export const POST = withRequestCapacity(async (req: NextRequest) => {
  try { const user = await requireAuth(); const body = await tryReadJsonRequest<Record<string, unknown>>(req); if (!body.ok) return body.response; return NextResponse.json(await addHeroPower(user.userId, body.value)); }
  catch (error) { return apiErrorResponse(error, { request: req, useCase: "profile.heroes.post" }); }
});
export const DELETE = withRequestCapacity(async (req: NextRequest) => {
  try { const user = await requireAuth(); const id = parseRouteId(req.nextUrl.searchParams.get("id") || "", "英雄战力 ID"); await removeHeroPower(user.userId, id); return NextResponse.json({ ok: true }); }
  catch (error) { return apiErrorResponse(error, { request: req, useCase: "profile.heroes.delete" }); }
});
