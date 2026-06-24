import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireAuth, verifyPassword } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: { userId: session.userId, username: session.username } });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { password } = await req.json();
  if (!password) {
    return NextResponse.json({ error: "请输入密码确认身份" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "密码错误" }, { status: 403 });
  }

  // 级联删除所有用户数据
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
