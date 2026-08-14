export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { deleteCombatPostComment } from "@/features/combat-posts/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId } from "@/lib/request-validation";

type Context = { params: Promise<{ postId: string; commentId: string }> };

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    return NextResponse.json(await deleteCombatPostComment(parseRouteId(params.postId, "动态 ID"), parseRouteId(params.commentId, "评论 ID")));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
