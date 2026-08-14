export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { isMatchScreenshotType } from "@/features/matches/model";
import { getMatchScreenshotForAdmin, uploadMatchScreenshot } from "@/features/matches/server/draft";
import { apiErrorResponse } from "@/lib/api-errors";
import { MAX_MATCH_SCREENSHOT_SIZE } from "@/lib/media-validation";
import { parseRouteId, readFormDataRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";

type Context = { params: Promise<{ id: string; matchId: string; type: string }> };

function parseParams(params: Awaited<Context["params"]>) {
  if (!isMatchScreenshotType(params.type)) throw new ServiceError("VALIDATION_ERROR", "截图类型无效");
  return { tournamentId: parseRouteId(params.id, "赛事 ID"), matchId: parseRouteId(params.matchId, "比赛 ID"), type: params.type };
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const ids = parseParams(await context.params);
    const form = await readFormDataRequest(request, MAX_MATCH_SCREENSHOT_SIZE + 1024 * 1024);
    const file = form.get("file");
    if (!(file instanceof File)) throw new ServiceError("VALIDATION_ERROR", "请选择截图文件");
    return NextResponse.json({ screenshot: await uploadMatchScreenshot(ids.tournamentId, ids.matchId, ids.type, file) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const ids = parseParams(await context.params);
    const file = await getMatchScreenshotForAdmin(ids.tournamentId, ids.matchId, ids.type);
    return new Response(Readable.toWeb(file.stream) as ReadableStream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalFilename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
