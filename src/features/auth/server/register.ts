import { Prisma } from "@prisma/client";
import { normalizeAuthUsername, normalizeSecurityAnswer, passwordValidationError, parseSecurityQuestion } from "@/features/auth/model";
import { hashPassword } from "@/lib/auth";
import { consumeRegistrationLimits, RateLimitError } from "@/lib/auth-rate-limit";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

export interface RegistrationInput {
  username: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRegistrationInput(value: unknown): RegistrationInput {
  if (!isRecord(value)) throw new ServiceError("VALIDATION_ERROR", "注册数据格式错误");
  const username = normalizeAuthUsername(value.username);
  const password = typeof value.password === "string" ? value.password : "";
  const confirmPassword = typeof value.confirmPassword === "string" ? value.confirmPassword : "";
  const question = typeof value.securityQuestion === "string" ? value.securityQuestion : "";
  const answer = normalizeSecurityAnswer(value.securityAnswer);
  if (!username) throw new ServiceError("VALIDATION_ERROR", "用户名长度应为 2-32 个字符");
  const passwordError = passwordValidationError(password);
  if (passwordError) throw new ServiceError("VALIDATION_ERROR", passwordError);
  if (password !== confirmPassword) throw new ServiceError("VALIDATION_ERROR", "两次密码不一致");
  if (!answer) throw new ServiceError("VALIDATION_ERROR", "安全问题答案不能为空且不能超过 72 字节");

  const securityQuestion = parseSecurityQuestion(question, value.customQuestion);
  if (!securityQuestion) throw new ServiceError("VALIDATION_ERROR", "无效安全问题，自定义问题须为 2-255 字");
  return { username, password, securityQuestion, securityAnswer: answer };
}

export async function registerAccount(value: unknown, requestIp: string) {
  const input = parseRegistrationInput(value);
  try {
    await consumeRegistrationLimits(requestIp);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new ServiceError("TOO_MANY_REQUESTS", "注册请求过于频繁，请稍后再试", { retryAfterSeconds: error.retryAfterSeconds });
    }
    throw error;
  }
  const existing = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
  if (existing) throw new ServiceError("CONFLICT", "用户名已被占用");
  const [passwordHash, securityAnswerHash] = await Promise.all([
    hashPassword(input.password),
    hashPassword(input.securityAnswer),
  ]);
  try {
    return await prisma.user.create({
      data: { username: input.username, passwordHash, securityQuestion: input.securityQuestion, securityAnswerHash },
      select: { id: true, username: true, role: true, sessionVersion: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ServiceError("CONFLICT", "用户名已被占用");
    }
    throw error;
  }
}