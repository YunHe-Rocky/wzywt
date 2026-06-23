import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string; appId: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const appId = parseInt(params.appId);
  const { status } = await req.json();

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员审批" }, { status: 403 });

  const app = await prisma.tempPlayerApplication.findFirst({ where: { id: appId, tournamentId } });
  if (!app) return NextResponse.json({ error: "申请不存在" }, { status: 404 });

  if (status === "approved") {
    // Create a temp User record (empty password = can't login)
    const tempUser = await prisma.user.create({
      data: { username: app.tempName || `临时_${Date.now()}`, passwordHash: "" },
    });
    await prisma.tournamentPlayer.create({
      data: { tournamentId, userId: tempUser.id, isTemporary: true, tempName: app.tempName, isSpectator: false },
    });
  }

  await prisma.tempPlayerApplication.update({ where: { id: appId }, data: { status } });
  return NextResponse.json({ ok: true });
}
