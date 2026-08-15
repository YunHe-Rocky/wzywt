import { NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { resourceScheduler } from "@/features/resource-scheduler/server/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await authorizeSuperAdmin();
  if (!authorization.ok) {
    const status = authorization.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? "请先登录" : "无权限" }, { status });
  }
  await resourceScheduler.sweep();
  return NextResponse.json(resourceScheduler.snapshots());
}
