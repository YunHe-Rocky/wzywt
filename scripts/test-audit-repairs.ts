import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { Prisma } from "@prisma/client";
import * as authModel from "../src/features/auth/model";
import { parseRolePreferences } from "../src/features/profile/model";
import { ServiceError } from "../src/lib/service-error";
import { resolveSessionCookieSecure } from "../src/lib/session-config";
import { avatarFilenamePattern } from "../src/features/profile/avatar-file";
import * as avatarType from "../src/features/profile/server/avatar";
import sharp from "sharp";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function loadModule(file: string, dependencies: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const fixtureModule = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
  const nativeRequire = createRequire(import.meta.url);
  new Function("require", "module", "exports", compiled)((name: string) => dependencies[name] ?? nativeRequire(name), fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

async function main() {
  assert.ok(avatarFilenamePattern.test("1_123456.jpg"));
  assert.ok(avatarFilenamePattern.test("1_64ab4a17-3ad4-4224-96ac-6871b0a28532.png"));
  assert.equal(avatarFilenamePattern.test("../1_1234.png"), false);
  assert.equal(authModel.passwordValidationError("a".repeat(72)), null);
  assert.ok(authModel.passwordValidationError("a".repeat(73)));
  assert.equal(authModel.passwordValidationError("中".repeat(24)), null);
  assert.ok(authModel.passwordValidationError("中".repeat(25)));
  assert.equal(authModel.parseSecurityQuestion("__custom__", "a".repeat(256)), null);
  assert.equal(authModel.normalizeSecurityAnswer("  "), null);
  assert.throws(() => resolveSessionCookieSecure({ NODE_ENV: "production", PUBLIC_ORIGIN: "https://game.example.com", SESSION_COOKIE_SECURE: "0" }));
  assert.equal(resolveSessionCookieSecure({ NODE_ENV: "production", DEPLOY_ENVIRONMENT: "local", PUBLIC_ORIGIN: "http://192.168.1.2:8001" }), false);

  const valid = ["top", "jungle", "mid", "adc", "support"].map((role_type, i) => ({ role_type, preference_rank: i + 1, role_rank: 0, peak_rank: 0, peak_score: 0 }));
  assert.equal(parseRolePreferences(valid).length, 5);
  for (const bad of [null, [null, ...valid.slice(1)], [{ ...valid[0], role_type: "oops" }, ...valid.slice(1)], [{ ...valid[0], preference_rank: 5 }, ...valid.slice(1)], [{ ...valid[0], role_rank: 11 }, ...valid.slice(1)]]) assert.throws(() => parseRolePreferences(bad));

  const account = { id: 1, sessionVersion: 1, passwordHash: "hash:old-password", securityAnswerHash: "hash:answer", deletedAt: null, banned: false, isTemporary: false };
  const tokens = new Set(["A"]);
  const database = {
    user: { findUnique: async () => ({ ...account }), updateMany: async ({ where, data }: { where: { sessionVersion: number }; data: Record<string, unknown> }) => {
      if (where.sessionVersion !== account.sessionVersion) return { count: 0 };
      if (typeof data.passwordHash === "string") account.passwordHash = data.passwordHash;
      if (typeof data.securityAnswerHash === "string") account.securityAnswerHash = data.securityAnswerHash;
      account.sessionVersion++; return { count: 1 };
    } }, passwordResetToken: { deleteMany: async () => { tokens.clear(); } },
  };
  const credentials = loadModule("src/features/auth/server/credentials.ts", {
    "@/lib/db": { prisma: database }, "../model": authModel, "@/lib/service-error": { ServiceError },
    "@/lib/auth": { hashPassword: async (text: string) => `hash:${text}`, verifyPassword: async (text: string, hash: string) => hash === `hash:${text}` },
    "@/lib/auth-rate-limit": { consumeSensitiveOperationLimits: async () => {} },
    "@/lib/serializable": { serializable: (callback: (tx: typeof database) => unknown) => callback(database) },
  });
  await assert.rejects(credentials.changeAccountPassword(1, { answer: "answer", newPassword: "中".repeat(25), confirmPassword: "中".repeat(25) }, "test"));
  assert.equal(account.sessionVersion, 1); assert.ok(tokens.has("A"));
  await credentials.changeAccountPassword(1, { answer: "answer", newPassword: "new-password-123", confirmPassword: "new-password-123" }, "test");
  assert.equal(account.sessionVersion, 2); assert.equal(account.passwordHash, "hash:new-password-123"); assert.equal(tokens.size, 0);
  tokens.add("B");
  await assert.rejects(credentials.changeRecoveryQuestion(1, { securityQuestion: "__custom__", customQuestion: "新问题", securityAnswer: "new-answer" }, "test"));
  assert.ok(tokens.has("B")); assert.equal(account.sessionVersion, 2);
  await credentials.changeRecoveryQuestion(1, { currentPassword: "new-password-123", securityQuestion: "__custom__", customQuestion: "新问题", securityAnswer: "new-answer" }, "test");
  assert.equal(account.sessionVersion, 3); assert.equal(tokens.size, 0);

  const data = new Map<string, string>();
  const redis = { get: async (key: string) => data.get(key) ?? null, set: async (key: string, value: string, mode?: string) => { if (mode !== "NX" || !data.has(key)) data.set(key, value); return "OK"; } };
  const cache = loadModule("src/lib/redis-query-cache.ts", { "./redis": { redis, warnRedisFailure() {} }, "./request-context": { requestContext: { getStore: () => ({ method: "GET" }) } } });
  const value = { at: new Date("2026-10-18T00:00:00Z"), bytes: BigInt(123), decimal: new Prisma.Decimal("1.25"), json: { type: "date", value: "user-data" } };
  assert.deepEqual(await cache.decodeCacheValue(await cache.encodeCacheValue(value)), value);
  let loads = 0;
  const load = async () => { loads++; return { value: loads }; };
  await cache.readThroughQuery("one", load); assert.deepEqual(await cache.readThroughQuery("one", load), { value: 1 }); assert.equal(loads, 1);
  let resume: (value: { value: string }) => void = () => {};
  const stale = cache.readThroughQuery("race", () => new Promise(resolve => { resume = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  await cache.invalidateQueryCache(); resume({ value: "old" }); await stale;
  assert.deepEqual(await cache.readThroughQuery("race", async () => ({ value: "new" })), { value: "new" });
  for (const params of [{ model: "User", action: "findUnique" }, { model: "Hero", action: "findMany", runInTransaction: true }, { model: "InternalMatch", action: "findFirst" }]) assert.equal(await cache.canCacheQuery(params, "GET"), false);
  assert.equal(await cache.canCacheQuery({ model: "Hero", action: "findMany" }, "POST"), false);
  const avatarDirectory = await mkdtemp(join(tmpdir(), "wzywt-avatar-regression-"));
  try {
    let currentAvatar = "1_12345.png"; let reads = 0; let allRead: () => void = () => {};
    const barrier = new Promise<void>(resolve => { allRead = resolve; });
    const avatar = loadModule("src/features/profile/server/avatar-upload.ts", {
      "./avatar": avatarType, "./avatar-storage": { getAvatarDirectory: () => avatarDirectory, ensureAvatarDirectory: async () => avatarDirectory },
      "@/lib/service-error": { ServiceError }, "@/lib/db": { prisma: { user: {
        findUnique: async () => { const row = { avatar: currentAvatar, sessionVersion: 1 }; if (++reads === 2) allRead(); await barrier; return row; },
        updateMany: async ({ where, data }: { where: { avatar: string }; data: { avatar: string } }) => {
          if (where.avatar !== currentAvatar) return { count: 0 }; currentAvatar = data.avatar; return { count: 1 };
        },
      } } },
    });
    await assert.rejects(avatar.uploadAccountAvatar(1, "invalid-field"));
    await assert.rejects(avatar.uploadAccountAvatar(1, new File([new Uint8Array([255, 216, 255])], "bad.jpg", { type: "image/jpeg" })));
    const oversized = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
    await assert.rejects(avatar.uploadAccountAvatar(1, new File([new Uint8Array(oversized)], "huge.png", { type: "image/png" })));
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).png().toBuffer();
    await writeFile(join(avatarDirectory, currentAvatar), png);
    const results = await Promise.allSettled([1, 2].map(() => avatar.uploadAccountAvatar(1, new File([new Uint8Array(png)], "avatar.png", { type: "image/png" }))));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.deepEqual(await readdir(avatarDirectory), [currentAvatar]);
  } finally { await rm(avatarDirectory, { recursive: true, force: true }); }
  console.log("Audit repairs: credential boundaries/revocation, recovery reauthentication, role inputs, secure cookies, Redis cache hits/types/stale-fill isolation passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

