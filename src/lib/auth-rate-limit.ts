import { createHash, randomBytes } from "crypto";
import { isIP } from "node:net";
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

export function normalizeRequestIp(value: string | null): string {
  const candidate = value?.trim().toLowerCase();
  if (!candidate || candidate.length > 64 || candidate.includes(",")) return "unknown";
  if (candidate.startsWith("::ffff:") && isIP(candidate.slice(7)) === 4) return candidate.slice(7);
  return isIP(candidate) ? candidate : "unknown";
}

export function getRequestIp(headers: Headers): string {
  // The production app is loopback-only and trusts the single edge Nginx to
  // overwrite X-Real-IP. Never select a client-controlled left-most XFF value.
  return normalizeRequestIp(headers.get("x-real-ip"));
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

export async function consumeLoginLimits(username: string, ip: string): Promise<void> {
  await consumeLimit("login_account", username.trim().toLowerCase(), 8);
  await consumeLimit("login_ip", ip, 30);
}

export async function clearLoginLimits(username: string, ip: string): Promise<void> {
  const keys = [["login_account", username.trim().toLowerCase()], ["login_ip", ip]] as const;
  await prisma.authRateLimit.deleteMany({
    where: { OR: keys.map(([scope, value]) => ({ scope, keyHash: hash(`${scope}:${value}`) })) },
  });
}

export async function consumeRegistrationLimits(ip: string): Promise<void> {
  await consumeLimit("registration_ip", ip, 5);
  await consumeLimit("registration_global", "global", 100);
}

export async function consumePasswordResetCompletionLimits(tokenHash: string, ip: string): Promise<void> {
  await consumeLimit("reset_complete_token", tokenHash, 5);
  await consumeLimit("reset_complete_ip", ip, 20);
}

export async function clearPasswordResetCompletionLimits(tokenHash: string, ip: string): Promise<void> {
  const keys = [["reset_complete_token", tokenHash], ["reset_complete_ip", ip]] as const;
  await prisma.authRateLimit.deleteMany({
    where: { OR: keys.map(([scope, value]) => ({ scope, keyHash: hash(`${scope}:${value}`) })) },
  });
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
