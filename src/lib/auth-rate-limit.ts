import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeIp(value: string | null): string {
  const first = value?.split(",", 1)[0]?.trim();
  return first && first.length <= 64 ? first : "unknown";
}

export function getRequestIp(headers: Headers): string {
  return normalizeIp(headers.get("x-forwarded-for") ?? headers.get("x-real-ip"));
}

async function consumeLimit(scope: string, key: string, maxAttempts: number): Promise<void> {
  const keyHash = hash(`${scope}:${key}`);
  let retryAfterSeconds = 0;
  for (let transactionAttempt = 0; transactionAttempt < 3; transactionAttempt++) {
    const now = new Date();
    try {
      retryAfterSeconds = await prisma.$transaction(async (tx) => {
        const record = await tx.authRateLimit.findUnique({
          where: { scope_keyHash: { scope, keyHash } },
        });

        if (record?.blockedUntil && record.blockedUntil > now) {
          return Math.ceil((record.blockedUntil.getTime() - now.getTime()) / 1000);
        }

        const windowExpired = !record || now.getTime() - record.windowStart.getTime() >= WINDOW_MS;
        const attempts = windowExpired ? 1 : record.attempts + 1;
        const blockedUntil = attempts > maxAttempts ? new Date(now.getTime() + BLOCK_MS) : null;

        await tx.authRateLimit.upsert({
          where: { scope_keyHash: { scope, keyHash } },
          create: { scope, keyHash, attempts, windowStart: now, blockedUntil },
          update: {
            attempts,
            windowStart: windowExpired ? now : record.windowStart,
            blockedUntil,
          },
        });

        return blockedUntil ? Math.ceil(BLOCK_MS / 1000) : 0;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      break;
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || transactionAttempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (transactionAttempt + 1)));
    }
  }

  if (retryAfterSeconds > 0) throw new RateLimitError(retryAfterSeconds);
}

export async function consumePasswordResetLimits(username: string, ip: string): Promise<void> {
  await consumeLimit("password_reset_account", username.trim().toLowerCase(), 5);
  await consumeLimit("password_reset_ip", ip, 10);
}

export async function clearPasswordResetLimits(username: string, ip: string): Promise<void> {
  const keys = [
    ["password_reset_account", username.trim().toLowerCase()],
    ["password_reset_ip", ip],
  ] as const;
  await prisma.authRateLimit.deleteMany({
    where: {
      OR: keys.map(([scope, value]) => ({ scope, keyHash: hash(`${scope}:${value}`) })),
    },
  });
}

export async function createPasswordResetToken(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ userId }, { expiresAt: { lte: now } }] },
    }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash: hash(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) },
    }),
  ]);
  return token;
}

export function hashPasswordResetToken(token: string): string {
  return hash(token);
}
