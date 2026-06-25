export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireAuth, verifyPassword } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ user: null });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { username: true, securityQuestion: true },
  });
  return NextResponse.json({
    user: {
      userId: session.userId,
      username: session.username,
      securityQuestion: user?.securityQuestion || null,
      hasSecurityQuestion: !!user?.securityQuestion,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { answer } = await req.json();
  if (!answer) {
    return NextResponse.json({ error: "请输入安全答案确认身份" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  if (!user.securityAnswerHash) {
    return NextResponse.json({ error: "请先设置安全问题" }, { status: 400 });
  }

  const valid = await verifyPassword(answer.trim(), user.securityAnswerHash);
  if (!valid) {
    return NextResponse.json({ error: "安全答案错误" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.tournamentPlayer.deleteMany({ where: { userId } }),
    prisma.tournamentAdmin.deleteMany({ where: { userId } }),
    prisma.rolePreference.deleteMany({ where: { userId } }),
    prisma.heroPower.deleteMany({ where: { userId } }),
    prisma.tempPlayerApplication.deleteMany({ where: { applicantId: userId } }),
    prisma.adminOperation.deleteMany({ where: { adminId: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  // 清除 session
  const session = await getSession();
  session.destroy();

  return NextResponse.json({ ok: true });
}
