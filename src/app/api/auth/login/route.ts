export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      role: true,
      banned: true,
      isTemporary: true,
      sessionVersion: true,
    },
  });
  if (!user || user.isTemporary) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  if (user.banned) {
    return NextResponse.json({ error: "账户已被封禁" }, { status: 403 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.role = user.role;
  session.sessionVersion = user.sessionVersion;
  await session.save();

  return NextResponse.json({ id: user.id, username: user.username, role: user.role });
}
