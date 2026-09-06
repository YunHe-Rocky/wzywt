export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { normalizeAuthUsername, passwordValidationError } from "@/features/auth/model";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { clearLoginLimits, consumeLoginLimits, getRequestIp, RateLimitError } from "@/lib/auth-rate-limit";
import { getSession } from "@/lib/session";
import { tryReadJsonRequest } from "@/lib/request-validation";

const INVALID_CREDENTIALS = "用户名或密码错误";
const DUMMY_PASSWORD_HASH = "$2b$10$MsNZPVWmxNhbIejCi//SReezMPP/CYSvAc2j3z4.K4NFKS3Lf2Ri6";

export async function POST(req: NextRequest) {
  const body = await tryReadJsonRequest<{ username?: unknown; password?: unknown }>(req);
  if (!body.ok) return body.response;
  const username = normalizeAuthUsername(body.value.username);
  const password = typeof body.value.password === "string" ? body.value.password : "";
  if (!username || !password) return NextResponse.json({ error: "请输入有效的用户名和密码" }, { status: 400 });
  if (passwordValidationError(password, 1)) return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });

  const ip = getRequestIp(req.headers);
  try {
    await consumeLoginLimits(username, ip);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, passwordHash: true, role: true, banned: true, isTemporary: true, sessionVersion: true, deletedAt: true },
  });
  const validPassword = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !validPassword || user.banned || user.isTemporary || user.deletedAt) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  await clearLoginLimits(username, ip);
  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.role = user.role;
  session.sessionVersion = user.sessionVersion;
  await session.save();
  return NextResponse.json({ id: user.id, username: user.username, role: user.role });
}
