import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { tryReadJsonRequest } from "@/lib/request-validation";
import { resourceScheduler } from "@/features/resource-scheduler/server/registry";
import { resourceSchedulerErrorResponse } from "@/features/resource-scheduler/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await tryReadJsonRequest<{ page?: unknown }>(request);
    if (!body.ok) return body.response;
    if (typeof body.value.page !== "string") return NextResponse.json({ error: "页面名称无效" }, { status: 400 });
    const auth = await authenticate();
    if (!auth.ok && auth.code === "BANNED") return NextResponse.json({ error: "账户已被封禁" }, { status: 403 });
    return NextResponse.json(await resourceScheduler.acquirePage(body.value.page, auth.ok ? auth.user.userId : null));
  } catch (error) {
    return resourceSchedulerErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await tryReadJsonRequest<{ leaseId?: unknown }>(request);
    if (!body.ok) return body.response;
    if (typeof body.value.leaseId !== "string") return NextResponse.json({ error: "租约 ID 无效" }, { status: 400 });
    return NextResponse.json({ lease: resourceScheduler.renewLease(body.value.leaseId) });
  } catch (error) {
    return resourceSchedulerErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await tryReadJsonRequest<{ leaseId?: unknown }>(request);
    if (!body.ok) return body.response;
    if (typeof body.value.leaseId !== "string") return NextResponse.json({ error: "租约 ID 无效" }, { status: 400 });
    await resourceScheduler.releaseLease(body.value.leaseId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return resourceSchedulerErrorResponse(error);
  }
}
