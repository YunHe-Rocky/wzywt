export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);

  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId },
  });

  if (!admin) return NextResponse.json({ error: "你不是管理员" }, { status: 403 });
  if (admin.role === "owner") {
    return NextResponse.json({ error: "房主不能弃权，请取消赛事" }, { status: 400 });
  }

  // 删除 admin 记录，保留 player 记录
  await prisma.tournamentAdmin.delete({
    where: { tournamentId_userId: { tournamentId, userId } },
  });

  return NextResponse.json({ ok: true });
}
