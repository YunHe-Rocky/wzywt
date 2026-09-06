import { NextRequest, NextResponse } from "next/server";
import { resourceScheduler } from "@/features/resource-scheduler/server/registry";
import { authenticate } from "@/lib/auth";
import { resourceSchedulerErrorResponse } from "@/features/resource-scheduler/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const leaseId = request.nextUrl.searchParams.get("leaseId");
    const resource = request.nextUrl.searchParams.get("resource");
    if (!leaseId || !resource) return NextResponse.json({ error: "缺少租约或资源参数" }, { status: 400 });
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const auth = await authenticate();
    if (!auth.ok && auth.code === "BANNED") return NextResponse.json({ error: "账户已被封禁" }, { status: 403 });
    const actor = auth.ok ? { userId: auth.user.userId } : null;
    return NextResponse.json(await resourceScheduler.getResource(leaseId, resource, actor, refresh));
  } catch (error) {
    return resourceSchedulerErrorResponse(error);
  }
}
