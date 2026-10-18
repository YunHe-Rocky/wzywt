import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { consumeSensitiveOperationLimits } from "@/lib/auth-rate-limit";
import { ServiceError } from "@/lib/service-error";
import { serializable } from "@/lib/serializable";
import { normalizeSecurityAnswer, parseSecurityQuestion, passwordValidationError } from "../model";

export async function verifyRecoveryAnswer(userId: number, input: unknown, ip: string, action: "change-password" | "delete-account") {
  const answer = normalizeSecurityAnswer(input);
  if (!answer) throw new ServiceError("VALIDATION_ERROR", "安全答案不能为空且不能超过 72 字节");
  await consumeSensitiveOperationLimits(userId, ip, action);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt || user.banned || user.isTemporary) throw new ServiceError("NOT_FOUND", "账户不可用");
  if (!user.securityAnswerHash || !await verifyPassword(answer, user.securityAnswerHash)) throw new ServiceError("INVALID_CREDENTIALS", "安全答案错误");
  return user;
}

async function replaceCredentials(userId: number, expectedVersion: number, data: { passwordHash?: string; securityQuestion?: string; securityAnswerHash?: string }) {
  return serializable(async tx => {
    const updated = await tx.user.updateMany({ where: { id: userId, sessionVersion: expectedVersion, banned: false, deletedAt: null, isTemporary: false },
      data: { ...data, sessionVersion: { increment: 1 } } });
    if (updated.count !== 1) throw new ServiceError("CONFLICT", "账户凭据已变化，请重新验证");
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    return expectedVersion + 1;
  });
}

export async function changeAccountPassword(userId: number, input: Record<string, unknown>, ip: string) {
  const user = await verifyRecoveryAnswer(userId, input.answer, ip, "change-password");
  if (input.verifyOnly === true) return { verified: true };
  const error = passwordValidationError(input.newPassword);
  if (error) throw new ServiceError("VALIDATION_ERROR", error);
  if (input.newPassword !== input.confirmPassword) throw new ServiceError("VALIDATION_ERROR", "两次密码不一致");
  const passwordHash = await hashPassword(input.newPassword as string);
  return { sessionVersion: await replaceCredentials(userId, user.sessionVersion, { passwordHash }) };
}

export async function changeRecoveryQuestion(userId: number, input: Record<string, unknown>, ip: string) {
  const question = parseSecurityQuestion(input.securityQuestion, input.customQuestion);
  const answer = normalizeSecurityAnswer(input.securityAnswer);
  if (!question || !answer) throw new ServiceError("VALIDATION_ERROR", "安全问题或答案无效：问题 2-255 字，答案最多 72 字节");
  await consumeSensitiveOperationLimits(userId, ip, "security-question");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const password = typeof input.currentPassword === "string" ? input.currentPassword : "";
  if (!user || passwordValidationError(password, 1) || !await verifyPassword(password, user.passwordHash)) throw new ServiceError("INVALID_CREDENTIALS", "请提供正确的当前密码");
  const securityAnswerHash = await hashPassword(answer);
  return { question, sessionVersion: await replaceCredentials(userId, user.sessionVersion, { securityQuestion: question, securityAnswerHash }) };
}

export async function lookupRecoveryQuestion(username: string, ip: string) {
  await consumeSensitiveOperationLimits(0, ip, `question:${username.toLowerCase()}`);
  const user = await prisma.user.findUnique({ where: { username }, select: { securityQuestion: true, banned: true, deletedAt: true, isTemporary: true } });
  if (!user || user.banned || user.deletedAt || user.isTemporary || !user.securityQuestion) throw new ServiceError("NOT_FOUND", "无法提供该账户的找回问题，请核对账户或联系管理员");
  return user.securityQuestion;
}
