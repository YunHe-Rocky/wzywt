import { redisNamespace } from "./redis-query-cache";
import { createHash, randomBytes } from "crypto";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { redis, warnRedisFailure } from "./redis";
import { ServiceError } from "./service-error";

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
  const trusted = process.env.TRUST_PROXY === "1" || (process.env.TRUST_PROXY !== "0" && process.env.DEPLOY_ENVIRONMENT !== "local");
  return trusted ? normalizeRequestIp(headers.get("x-real-ip")) : "direct";
}

async function consumeLimit(scope: string, key: string, maxAttempts: number): Promise<void> {
  const keyHash = hash(`${scope}:${key}`);
  if (redis) {
    try {
      const delay = Number(await redis.eval(`
        local blocked = tonumber(redis.call('HGET', KEYS[1], 'blocked') or '0')
        local now = tonumber(ARGV[1])
        if blocked > now then return math.ceil((blocked-now)/1000) end
        local start = tonumber(redis.call('HGET', KEYS[1], 'start') or '0')
        local count = tonumber(redis.call('HGET', KEYS[1], 'count') or '0')
        if now-start >= tonumber(ARGV[2]) then start=now count=0 end
        count=count+1 blocked=0
        if count > tonumber(ARGV[3]) then blocked=now+tonumber(ARGV[4]) end
        redis.call('HSET', KEYS[1], 'start', start, 'count', count, 'blocked', blocked)
        redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2])+tonumber(ARGV[4]))
        if blocked > now then return math.ceil((blocked-now)/1000) end
        return 0`, 1, `${redisNamespace}:auth-limit:${scope}:${keyHash}`, Date.now(), WINDOW_MS, maxAttempts, BLOCK_MS));
      if (delay > 0) throw new RateLimitError(delay);
      return;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      warnRedisFailure("auth-limit", error);
      if (process.env.REDIS_REQUIRED === "1") throw new ServiceError("SERVICE_UNAVAILABLE", "认证限流服务不可用");
    }
  }
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
  await clearRedisLimits(keys);
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
  await clearRedisLimits(keys);
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
  await clearRedisLimits(keys);
  await prisma.authRateLimit.deleteMany({
    where: {
      OR: keys.map(([scope, value]) => ({ scope, keyHash: hash(`${scope}:${value}`) })),
    },
  });
}

export async function createPasswordResetToken(userId: number, expectedVersion?: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
    if (!user || (expectedVersion !== undefined && user.sessionVersion !== expectedVersion)) throw new ServiceError("CONFLICT", "账户凭据已变化，请重新验证");
    await tx.passwordResetToken.deleteMany({
      where: { OR: [{ userId }, { expiresAt: { lte: now } }] },
    });
    await tx.passwordResetToken.create({
      data: { userId, tokenHash: hash(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return token;
}

export function hashPasswordResetToken(token: string): string {
  return hash(token);
}

async function clearRedisLimits(keys: readonly (readonly [string, string])[]): Promise<void> {
  if (!redis) return;
  try { await redis.del(...keys.map(([scope, key]) => `${redisNamespace}:auth-limit:${scope}:${hash(`${scope}:${key}`)}`)); }
  catch (error) { warnRedisFailure("auth-limit-clear", error); }
}

export async function consumeSensitiveOperationLimits(userId: number, ip: string, action: string): Promise<void> {
  try {
    await consumeLimit("sensitive_account", `${action}:${userId}`, 5);
    await consumeLimit("sensitive_ip", ip, 30);
  } catch (error) {
    if (error instanceof RateLimitError) throw new ServiceError("TOO_MANY_REQUESTS", "验证次数过多，请稍后重试", { retryAfterSeconds: error.retryAfterSeconds });
    throw error;
  }
}
