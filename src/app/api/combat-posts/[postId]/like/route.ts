export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { likeCombatPost, unlikeCombatPost } from "@/features/combat-posts/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId } from "@/lib/request-validation";

type Context = { params: Promise<{ postId: string }> };

export async function PUT(_request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    return NextResponse.json(await likeCombatPost(parseRouteId(postId, "动态 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    return NextResponse.json(await unlikeCombatPost(parseRouteId(postId, "动态 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
