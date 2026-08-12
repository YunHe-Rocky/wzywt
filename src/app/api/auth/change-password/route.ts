export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, hashPassword, verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const { answer, newPassword, confirmPassword, verifyOnly } = await req.json();

  if (!answer) {
    return NextResponse.json({ error: "请输入安全答案" }, { status: 400 });
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

  // verifyOnly: only check answer, don't change password (for two-step modal)
  if (verifyOnly) {
    return NextResponse.json({ ok: true, verified: true });
  }

  if (!newPassword || !confirmPassword) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (newPassword.length < 11) {
    return NextResponse.json({ error: "密码至少11位" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  // 当前设备继续登录，其他设备的旧 Session 立即失效。
  const session = await getSession();
  session.sessionVersion = updated.sessionVersion;
  await session.save();

  return NextResponse.json({ ok: true });
}
