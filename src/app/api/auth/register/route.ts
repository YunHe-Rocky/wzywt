import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, email, password, code } = await req.json();

  if (!username || !password || !email || !code) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (username.length < 2 || password.length < 11) {
    return NextResponse.json({ error: "用户名至少2位，密码至少11位" }, { status: 400 });
  }

  if (!email.endsWith("@qq.com")) {
    return NextResponse.json({ error: "请输入有效的QQ邮箱地址" }, { status: 400 });
  }

  // 检查用户名
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }

  // 检查邮箱
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 409 });
  }

  // 校验验证码（从 kv_cache 查）
  const cacheRow = await prisma.$queryRawUnsafe(
    "SELECT `value` FROM kv_cache WHERE `key` = ?",
    `verify_${email}`
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
      JSON.stringify(cached), `verify_${email}`
    );
    if (attempts >= 5) {
      return NextResponse.json({ error: "验证码错误次数过多，请15分钟后再试" }, { status: 429 });
    }
    return NextResponse.json({ error: "验证码错误" }, { status: 400 });
  }

  if (Date.now() > cached.expires) {
    return NextResponse.json({ error: "验证码已过期，请重新发送" }, { status: 400 });
  }

  // 创建用户
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      email,
      emailVerified: true,
    },
  });

  // 清除验证码缓存
  await prisma.$executeRawUnsafe(
    "DELETE FROM kv_cache WHERE `key` = ?",
    `verify_${email}`
  );

  // 登录
  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ id: user.id, username: user.username });
}
