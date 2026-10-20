import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createCombatPost, listCombatPosts } from "@/features/combat-posts/server/service";
import { readCombatPostUpload } from "@/features/combat-posts/server/upload";
import { releaseMediaReservation, reserveMediaUpload } from "@/features/media/server/quota";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireAuth } from "@/lib/auth";
import { getCombatVideoPolicy } from "@/features/combat-posts/server/video-policy";
import { assertVideoRuntime } from "@/lib/video-normalization";

async function handleGET(request: NextRequest) {
  try {
    return NextResponse.json(await listCombatPosts(request.nextUrl.searchParams.get("page") || 1));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const user = await requireAuth();
    await assertVideoRuntime();
    const policy = getCombatVideoPolicy();
    const maximum = policy.maxBytes;
    const declared = Number(request.headers.get("content-length"));
    const reservedBytes = Number.isSafeInteger(declared) && declared > 0 ? Math.min(declared, maximum) : maximum;
    const reservation = await reserveMediaUpload(user.userId, "combat-video", reservedBytes, new Date(), Math.max(15 * 60_000, policy.uploadTimeoutMs + 60_000));
    try {
      const upload = await readCombatPostUpload(request, reservation.id, user.userId);
      return NextResponse.json({ post: await createCombatPost(upload.fields, upload.video, user) }, { status: 201 });
    } finally {
      await releaseMediaReservation(reservation.id, user.userId).catch(() => undefined);
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const GET = withRequestCapacity(handleGET);
export const POST = withRequestCapacity(handlePOST);
