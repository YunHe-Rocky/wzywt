export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createCombatPostComment } from "@/features/combat-posts/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId, readJsonRequest } from "@/lib/request-validation";

type Context = { params: Promise<{ postId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    return NextResponse.json({ comment: await createCombatPostComment(parseRouteId(postId, "动态 ID"), await readJsonRequest(request)) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
