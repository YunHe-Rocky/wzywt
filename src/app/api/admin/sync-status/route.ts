export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const row = await prisma.kvCache.findUnique({ where: { key: "sync:heroes:progress" } });
  if (!row) {
    return NextResponse.json({ progress: null });
  }
  return NextResponse.json({ progress: JSON.parse(row.value) });
}
