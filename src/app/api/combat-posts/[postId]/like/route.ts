import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { likeCombatPost, unlikeCombatPost } from "@/features/combat-posts/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId } from "@/lib/request-validation";

type Context = { params: Promise<{ postId: string }> };

async function handlePUT(_request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    return NextResponse.json(await likeCombatPost(parseRouteId(postId, "动态 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function handleDELETE(_request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    return NextResponse.json(await unlikeCombatPost(parseRouteId(postId, "动态 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const PUT = withRequestCapacity(handlePUT);
export const DELETE = withRequestCapacity(handleDELETE);
