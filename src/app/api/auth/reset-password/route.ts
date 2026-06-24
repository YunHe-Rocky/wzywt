import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, code, newPassword } = await req.json();

  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (newPassword.length < 11) {
    return NextResponse.json({ error: "密码至少11位" }, { status: 400 });
  }

  // 查找用户
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "该邮箱未绑定任何账号" }, { status: 404 });
  }

  // 从 kv_cache 校验验证码
  const cacheKey = `reset_${email}`;
  const cacheRow = await prisma.$queryRawUnsafe(
    "SELECT `value` FROM kv_cache WHERE `key` = ?",
    cacheKey
  ) as { value: string }[];

  if (!cacheRow.length) {
    return NextResponse.json({ error: "请先发送验证码" }, { status: 400 });
  }

  const cached = JSON.parse(cacheRow[0].value);
  if (cached.code !== code) {
    const attempts = (cached.attempts || 0) + 1;
    cached.attempts = attempts;
    await prisma.$executeRawUnsafe(
      "UPDATE kv_cache SET `value` = ? WHERE `key` = ?",
      JSON.stringify(cached), cacheKey
    );
    if (attempts >= 5) {
      return NextResponse.json({ error: "验证码错误次数过多，请15分钟后再试" }, { status: 429 });
    }
    return NextResponse.json({ error: "验证码错误" }, { status: 400 });
  }

  if (Date.now() > cached.expires) {
    return NextResponse.json({ error: "验证码已过期，请重新发送" }, { status: 400 });
  }

  // 更新密码
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // 清除验证码缓存
  await prisma.$executeRawUnsafe(
    "DELETE FROM kv_cache WHERE `key` = ?",
    cacheKey
  );

  return NextResponse.json({ ok: true });
}
