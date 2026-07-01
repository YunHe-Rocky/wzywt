export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, answer, newPassword, confirmPassword } = await req.json();

  if (!username || !answer) {
    return NextResponse.json({ error: "请填写用户名和安全答案" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  if (!user.securityAnswerHash) {
    return NextResponse.json({ error: "该账号未设置安全问题" }, { status: 400 });
  }

  const valid = await verifyPassword(answer.trim(), user.securityAnswerHash);
  if (!valid) {
    return NextResponse.json({ error: "安全答案错误" }, { status: 403 });
  }

  // Answer verified — now require valid new password
  if (!newPassword || !confirmPassword) {
    return NextResponse.json({ ok: true }); // verification-only call
  }

  if (newPassword.length < 11) {
    return NextResponse.json({ error: "密码至少11位" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
