export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCombatPost, moderateCombatPost } from "@/features/combat-posts/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";

type Context = { params: Promise<{ postId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    return NextResponse.json(await getCombatPost(parseRouteId(postId, "动态 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    const body = await readJsonRequest(request);
    const action = typeof body === "object" && body !== null && "action" in body ? body.action : undefined;
    return NextResponse.json(await moderateCombatPost(parseRouteId(postId, "动态 ID"), action));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
