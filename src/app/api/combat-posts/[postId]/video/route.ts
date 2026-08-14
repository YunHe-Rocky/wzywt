export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { openCombatPostVideo } from "@/features/combat-posts/server/service";
import { apiErrorResponse } from "@/lib/api-errors";
import { parseRouteId } from "@/lib/request-validation";

type Context = { params: Promise<{ postId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { postId } = await context.params;
    const video = await openCombatPostVideo(parseRouteId(postId, "动态 ID"), request.headers.get("range"));
    if (video.kind === "invalid") {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${video.size}`, "Accept-Ranges": "bytes" } });
    }
    const baseHeaders = {
      "Content-Type": video.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (video.kind === "full") {
      return new Response(Readable.toWeb(video.stream) as ReadableStream, { headers: { ...baseHeaders, "Content-Length": String(video.size) } });
    }
    const length = video.range.end - video.range.start + 1;
    return new Response(Readable.toWeb(video.stream) as ReadableStream, {
      status: 206,
      headers: { ...baseHeaders, "Content-Length": String(length), "Content-Range": `bytes ${video.range.start}-${video.range.end}/${video.size}` },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
