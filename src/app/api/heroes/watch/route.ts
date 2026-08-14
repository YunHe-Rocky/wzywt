export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  addClient,
  getHeroEventClientCount,
  MAX_HERO_EVENT_CLIENTS,
  removeClient,
} from "@/features/heroes/server/events";
import { queueMonitorCycle } from "@/features/monitor/cycle";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireSuperAdmin } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  if (getHeroEventClientCount() >= MAX_HERO_EVENT_CLIENTS) {
    return NextResponse.json({ error: "实时连接数量已达上限" }, { status: 503 });
  }
  let cleanup: () => void = () => undefined;
  const stream = new ReadableStream({
    start(controller) {
      addClient(controller);
      const onAbort = () => {
        removeClient(controller);
        req.signal.removeEventListener("abort", onAbort);
      };
      cleanup = onAbort;
      req.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST() {
  try {
    const user = await requireSuperAdmin();
    const request = await queueMonitorCycle(user.userId);
    return NextResponse.json({ ok: true, jobId: request.jobId, message: request.message }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
