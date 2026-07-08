export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { newDeadline } = await req.json();
  if (!newDeadline) return NextResponse.json({ error: "请提供新的截止时间" }, { status: 400 });
  if (new Date(newDeadline) < new Date()) {
    return NextResponse.json({ error: "新的截止时间不能是过去" }, { status: 400 });
  }

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员操作" }, { status: 403 });

  // Cooldown check for co_owner
  if (admin.role === "co_owner") {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentOwnerOp = await prisma.adminOperation.findFirst({
      where: {
        tournamentId,
        action: "extend",
        createdAt: { gte: fiveMinAgo },
        admin: { tournamentAdmins: { some: { tournamentId, role: "owner" } } },
      },
    });
    if (recentOwnerOp) {
      return NextResponse.json({ error: "房主5分钟内执行过此操作，请稍后再试" }, { status: 409 });
    }
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { deadline: new Date(newDeadline), status: "recruiting" },
  });

  await prisma.adminOperation.create({
    data: { tournamentId, adminId: userId, action: "extend" },
  });

  return NextResponse.json({ ok: true });
}
