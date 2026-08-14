export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { authenticate, verifyPassword } from "@/lib/auth";
import { deleteUserAndOwnedTournaments } from "@/features/users/server/deleteUser";
import { tryReadJsonRequest } from "@/lib/request-validation";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ user: null }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Expires": "0" },
    });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      securityQuestion: true,
      role: true,
      avatar: true,
      gameNickname: true,
      gameId: true,
      isTemporary: true,
      banned: true,
      sessionVersion: true,
    },
  });
  // 用户已被删除 → 清除幽灵 session
  if (!user || user.isTemporary || session.sessionVersion !== user.sessionVersion) {
    session.destroy();
    return NextResponse.json({ user: null }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Expires": "0" },
    });
  }
  // 用户被封禁 → 清除 session
  if (user.banned) {
    session.destroy();
    return NextResponse.json({ user: null, banned: true }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Expires": "0" },
    });
  }
  return NextResponse.json({
    user: {
      userId: session.userId,
      username: user.username,
      securityQuestion: user.securityQuestion || null,
      hasSecurityQuestion: !!user.securityQuestion,
      role: user.role,
      avatar: user.avatar,
      gameNickname: user.gameNickname,
      gameId: user.gameId,
    },
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const body = await tryReadJsonRequest<{ answer?: unknown }>(req);
  if (!body.ok) return body.response;
  const answer = typeof body.value.answer === "string" ? body.value.answer : "";
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

  await deleteUserAndOwnedTournaments(userId);

  // 清除 session
  const session = await getSession();
  session.destroy();

  return NextResponse.json({ ok: true });
}
