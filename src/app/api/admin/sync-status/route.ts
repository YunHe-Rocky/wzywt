export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { parseHeroSyncProgress } from "@/features/heroes/server/sync-jobs";

export async function GET() {
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const row = await prisma.kvCache.findUnique({ where: { key: "sync:heroes:progress" } });
  if (!row) {
    return NextResponse.json({ progress: null });
  }
  return NextResponse.json({ progress: parseHeroSyncProgress(row.value) });
}
