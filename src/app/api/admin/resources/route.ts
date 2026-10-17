import { withRequestCapacity } from "@/lib/request-capacity";
import { NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { resourceScheduler } from "@/features/resource-scheduler/server/registry";
import { resourceGovernor } from "@/lib/resource-governor";

export const dynamic = "force-dynamic";

async function handleGET() {
  const authorization = await authorizeSuperAdmin();
  if (!authorization.ok) {
    const status = authorization.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? "请先登录" : "无权限" }, { status });
  }
  await resourceScheduler.sweep();
  return NextResponse.json({ ...resourceScheduler.snapshots(), runtime: resourceGovernor.snapshot() });
}

export const GET = withRequestCapacity(handleGET);
