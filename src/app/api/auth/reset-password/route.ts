export const dynamic = "force-dynamic";

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  clearPasswordResetLimits,
  consumePasswordResetLimits,
  createPasswordResetToken,
  getRequestIp,
  hashPasswordResetToken,
  RateLimitError,
} from "@/lib/auth-rate-limit";
import { prisma } from "@/lib/db";
import { tryReadJsonRequest } from "@/lib/request-validation";

const INVALID_CREDENTIALS = "账号或安全答案错误";

function tooManyRequests(error: RateLimitError) {
  return NextResponse.json(
    { error: "尝试次数过多，请稍后再试" },
    { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
  );
}

export async function POST(req: NextRequest) {
  const parsedBody = await tryReadJsonRequest<Record<string, unknown>>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;

  const resetToken = typeof body.resetToken === "string" ? body.resetToken : "";
  if (resetToken) return completePasswordReset(body, resetToken);

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!username || !answer) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 400 });
  }

  const ip = getRequestIp(req.headers);
  try {
    await consumePasswordResetLimits(username, ip);
  } catch (error) {
    if (error instanceof RateLimitError) return tooManyRequests(error);
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, securityAnswerHash: true, banned: true, isTemporary: true },
  });
  const valid = user?.securityAnswerHash
    ? await verifyPassword(answer, user.securityAnswerHash)
    : false;
  if (!user || !valid || user.banned || user.isTemporary) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const token = await createPasswordResetToken(user.id);
  await clearPasswordResetLimits(username, ip);
  return NextResponse.json({ ok: true, resetToken: token, expiresIn: 600 });
}

async function completePasswordReset(body: Record<string, unknown>, resetToken: string) {
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (newPassword.length < 11) {
    return NextResponse.json({ error: "密码至少11位" }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(resetToken);
  const passwordHash = await hashPassword(newPassword);
  try {
    await prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!token || token.expiresAt <= new Date()) throw new Error("INVALID_RESET_TOKEN");

      const consumed = await tx.passwordResetToken.deleteMany({ where: { id: token.id } });
      if (consumed.count !== 1) throw new Error("INVALID_RESET_TOKEN");

      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_RESET_TOKEN") {
      return NextResponse.json({ error: "重置凭证无效或已过期" }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
