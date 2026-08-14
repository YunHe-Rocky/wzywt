export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createCombatPost, listCombatPosts } from "@/features/combat-posts/server/service";
import { readCombatPostUpload } from "@/features/combat-posts/server/upload";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listCombatPosts(request.nextUrl.searchParams.get("page") || 1));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const upload = await readCombatPostUpload(request);
    return NextResponse.json({ post: await createCombatPost(upload.fields, upload.video, user) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
