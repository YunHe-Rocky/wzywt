import { verifyRecoveryAnswer } from "@/features/auth/server/credentials";
import { getRequestIp } from "@/lib/auth-rate-limit";
import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { deleteUserAndOwnedTournaments } from "@/features/users/server/deleteUser";
import { tryReadJsonRequest } from "@/lib/request-validation";
import { apiErrorResponse } from "@/lib/api-errors";
import { resourceScheduler } from "@/features/resource-scheduler/server/registry";

async function handleGET() {
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
      deletedAt: true,
    },
  });
  // 只读检查只返回未登录，不销毁 Cookie。旧标签页的失效响应可能晚于
  // 新登录响应到达；若在这里清 Cookie，会误删浏览器共享的新会话。
  if (!user || user.isTemporary || user.deletedAt || session.sessionVersion !== user.sessionVersion) {
    return NextResponse.json({ user: null }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Expires": "0" },
    });
  }
  // 封禁状态同样按只读方式拒绝，不让旧响应覆盖其他标签页的新会话。
  if (user.banned) {
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

async function handleDELETE(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const body = await tryReadJsonRequest<{ answer?: unknown }>(req);
  if (!body.ok) return body.response;
  try {
    const verifiedUser = await verifyRecoveryAnswer(userId, body.value.answer, getRequestIp(req.headers), "delete-account");
    const deletion = await deleteUserAndOwnedTournaments(userId, verifiedUser.sessionVersion);
    resourceScheduler.releaseUserLeases(userId);
    const session = await getSession();
    session.destroy();
    return NextResponse.json({ ok: true, accountState: deletion.mode });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const GET = withRequestCapacity(handleGET);
export const DELETE = withRequestCapacity(handleDELETE);
