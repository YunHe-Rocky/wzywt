import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const { email, type } = await req.json();

  if (!email || !type) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  if (!email.endsWith("@qq.com")) {
    return NextResponse.json({ error: "请输入有效的QQ邮箱地址" }, { status: 400 });
  }

  if (!["register", "reset"].includes(type)) {
    return NextResponse.json({ error: "无效的验证类型" }, { status: 400 });
  }

  // 注册：检查邮箱是否已被使用
  if (type === "register") {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 409 });
    }
  }

  // 重置密码：检查邮箱是否已注册
  if (type === "reset") {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "该邮箱未绑定任何账号" }, { status: 404 });
    }
  }

  const cacheKey = type === "register" ? `verify_${email}` : `reset_${email}`;

  // 检查60秒冷却
  const existingCache = await prisma.$queryRawUnsafe(
    "SELECT `value` FROM kv_cache WHERE `key` = ?",
    cacheKey
  ) as { value: string }[];

  if (existingCache.length > 0) {
    const cached = JSON.parse(existingCache[0].value);
    const elapsed = (Date.now() - cached.createdAt) / 1000;
    if (elapsed < 60) {
      return NextResponse.json(
        { error: `请${Math.ceil(60 - elapsed)}秒后再发送验证码` },
        { status: 429 }
      );
    }
  }

  // 生成6位验证码，5分钟有效
  const code = generateCode();
  const expires = Date.now() + 5 * 60 * 1000;

  // 存储验证码到 kv_cache
  await prisma.$executeRawUnsafe(
    "INSERT INTO kv_cache (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
    cacheKey,
    JSON.stringify({ code, expires, attempts: 0, createdAt: Date.now() }),
    JSON.stringify({ code, expires, attempts: 0, createdAt: Date.now() })
  );

  // 发送邮件
  const result = await sendVerificationEmail(email, code, type as "register" | "reset");
  if (!result.success) {
    return NextResponse.json(
      { error: "邮件发送失败，请稍后重试" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
