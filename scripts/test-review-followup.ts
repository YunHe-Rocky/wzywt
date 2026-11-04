import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { ServiceError } from "../src/lib/service-error";
import * as authModel from "../src/features/auth/model";
import * as combatModel from "../src/features/combat-posts/model";

// Run actual service code with controlled failure points, without any database,
// media store, Redis connection or production environment.
function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const fixture = { exports: {} };
  const nativeRequire = createRequire(import.meta.url);
  new Function("require", "module", "exports", compiled)(
    (name: string) => dependencies[name] ?? nativeRequire(name), fixture, fixture.exports,
  );
  return fixture.exports as T;
}

async function verifyRateLimits() {
  type Row = { attempts: number; windowStart: Date; blockedUntil: Date | null };
  const rows = new Map<string, Row>();
  type Key = { scope: string; keyHash: string };
  const database = { authRateLimit: {
    findUnique: async ({ where }: { where: { scope_keyHash: Key } }) => rows.get(JSON.stringify(where.scope_keyHash)),
    upsert: async ({ where, create, update }: { where: { scope_keyHash: Key }; create: Row; update: Row }) => {
      const key = JSON.stringify(where.scope_keyHash);
      rows.set(key, rows.has(key) ? update : create);
    },
    deleteMany: async ({ where }: { where: { OR: Key[] } }) => {
      for (const key of where.OR) rows.delete(JSON.stringify(key));
    },
  } };
  const dependencies = {
    "./db": { prisma: { ...database, $transaction: (operation: (tx: typeof database) => unknown) => operation(database) } },
    "./redis": { redis: null, warnRedisFailure() {} },
    "./redis-query-cache": { redisNamespace: "review-test" },
    "./service-error": { ServiceError },
  };
  const limits = load<typeof import("../src/lib/auth-rate-limit")>("src/lib/auth-rate-limit.ts", dependencies);
  for (let attempt = 0; attempt < 30; attempt++) {
    await limits.consumeLoginLimits("valid-account", "source-a");
    await limits.clearLoginLimits("valid-account");
  }
  await assert.rejects(limits.consumeLoginLimits("another-account", "source-a"), limits.RateLimitError,
    "a valid password cannot erase the source budget for attacks on other accounts");
  assert.equal([...rows.keys()].some(key => key.includes("login_account")), false,
    "a blocked source must not consume another account's budget");
  rows.clear();
  for (let attempt = 0; attempt < 8; attempt++) await limits.consumeLoginLimits("locked-account", "source-b");
  await assert.rejects(limits.consumeLoginLimits("LOCKED-ACCOUNT", "source-b"), limits.RateLimitError);
  rows.clear();
  for (let attempt = 0; attempt < 10; attempt++) {
    await limits.consumePasswordResetLimits("recovery-account", "source-c");
    await limits.clearPasswordResetLimits("recovery-account");
  }
  await assert.rejects(limits.consumePasswordResetLimits("recovery-account", "source-c"), limits.RateLimitError);
  rows.clear();
  for (let attempt = 0; attempt < 20; attempt++) {
    await limits.consumePasswordResetCompletionLimits("valid-token-hash", "source-d");
    await limits.clearPasswordResetCompletionLimits("valid-token-hash");
  }
  await assert.rejects(limits.consumePasswordResetCompletionLimits("valid-token-hash", "source-d"), limits.RateLimitError);

  const deleted: string[] = [];
  const redisLimits = load<typeof limits>("src/lib/auth-rate-limit.ts", {
    ...dependencies,
    "./redis": { redis: { del: async (...keys: string[]) => { deleted.push(...keys); } }, warnRedisFailure() {} },
  });
  await redisLimits.clearLoginLimits("valid-account");
  await redisLimits.clearPasswordResetLimits("recovery-account");
  await redisLimits.clearPasswordResetCompletionLimits("valid-token-hash");
  assert.equal(deleted.length, 3);
  assert.ok(deleted.every(key => !key.includes("_ip:")), "Redis clears only account/token scopes too");
}

async function verifyScreenshotFailureSafety() {
  const files = new Set(["old", "new"]);
  let committedKey = "old";
  let failTransaction = false;
  let failNewCleanup = false;
  const databaseFailure = new Error("controlled transaction failure");
  const storage = {
    save: async () => { files.add("new"); return { key: "new", size: 3 }; },
    delete: async (key: string) => {
      if (key === "old" || failNewCleanup) throw new Error("storage unavailable");
      files.delete(key);
    },
  };
  const cleanup = load<typeof import("../src/features/media/server/storage-cleanup")>("src/features/media/server/storage-cleanup.ts", {
    "@/lib/db": { prisma: { kvCache: { upsert: async () => { throw new Error("cleanup queue unavailable"); } } } },
    "./quota": {}, "@/features/profile/server/avatar-upload": {},
  });
  const tx = {
    internalMatch: { updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    matchScreenshot: {
      findUnique: async () => ({ storageKey: "old" }), upsert: async () => ({ id: 1, type: "KDA" }),
      updateMany: async () => ({}), count: async () => 1,
    },
    matchRecognition: { updateMany: async () => ({}) },
  };
  let releases = 0;
  const draft = load<typeof import("../src/features/matches/server/draft")>("src/features/matches/server/draft.ts", {
    "@/features/matches/model": { MATCH_SCREENSHOT_TYPES: ["KDA"] },
    "@/features/matches/visibility": {},
    "@/features/media/server/quota": {
      reserveMediaUpload: async () => ({ id: 1 }), attachMediaReservation: async () => {},
      consumeMediaReservation: async () => {}, releaseMediaReservation: async () => { releases++; },
    },
    "@/features/media/server/storage-cleanup": cleanup,
    "@/lib/auth": {}, "@/lib/permissions": {}, "./access": {},
    "@/lib/service-error": { ServiceError }, "@/lib/storage": { getMediaStorage: () => storage },
    "@/lib/media-validation": { validateScreenshotFile: async () => ({ data: Buffer.from("png"), extension: "png" }) },
    "@/lib/db": { prisma: { $transaction: async (operation: (client: typeof tx) => unknown) => {
      if (failTransaction) throw databaseFailure;
      const result = await operation(tx); committedKey = "new"; return result;
    } } },
  });
  const authorization = { tournamentId: 1, matchId: 2, actorUserId: 3, expectedEvidenceRevision: 1 };
  const file = new File(["png"], "test.png");
  const originalError = console.error;
  const warnings: unknown[][] = [];
  console.error = (...args: unknown[]) => { warnings.push(args); };
  try {
    assert.equal((await draft.uploadMatchScreenshot(authorization, "KDA", file)).id, 1);
    assert.equal(committedKey, "new"); assert.ok(files.has("new")); assert.ok(files.has("old"));
    assert.equal(releases, 0); assert.equal(warnings.length, 1);
    committedKey = "old"; failTransaction = true;
    await assert.rejects(draft.uploadMatchScreenshot(authorization, "KDA", file), error => error === databaseFailure);
    assert.ok(files.has("old")); assert.equal(files.has("new"), false); assert.equal(releases, 1);
    failNewCleanup = true;
    await assert.rejects(draft.uploadMatchScreenshot(authorization, "KDA", file), error => error === databaseFailure,
      "secondary cleanup errors must preserve the original database failure");
    assert.ok(files.has("old"));
  } finally { console.error = originalError; }
}

async function verifyPasswordRecovery() {
  const tokenValue = "A".repeat(43);
  let token: { id: number; userId: number; expiresAt: Date } | null = null;
  const account = { id: 1, sessionVersion: 1, securityAnswerHash: "hash:answer", passwordHash: "hash:old", banned: false, isTemporary: false, deletedAt: null };
  const database = {
    user: {
      findUnique: async () => ({ ...account }),
      updateMany: async ({ data }: { data: { passwordHash: string } }) => {
        if (account.banned || account.deletedAt || account.isTemporary) return { count: 0 };
        account.passwordHash = data.passwordHash; account.sessionVersion++; return { count: 1 };
      },
    },
    passwordResetToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => where.tokenHash === tokenValue ? token : null,
      deleteMany: async () => { const count = token ? 1 : 0; token = null; return { count }; },
    },
  };
  const route = load<{ POST: (request: Request) => Promise<Response> }>("src/app/api/auth/reset-password/route.ts", {
    "@/lib/request-capacity": { withRequestCapacity: (handler: unknown) => handler },
    "@/features/auth/model": authModel,
    "@/lib/auth": { verifyPassword: async (answer: string, hash: string) => hash === `hash:${answer}`, hashPassword: async (password: string) => `hash:${password}` },
    "@/lib/db": { prisma: { ...database, $transaction: async (operation: (tx: typeof database) => Promise<unknown>) => {
      const previous = token;
      try { return await operation(database); } catch (error) { token = previous; throw error; }
    } } },
    "@/lib/auth-rate-limit": {
      getRequestIp: () => "test-source", hashPasswordResetToken: (value: string) => value,
      consumePasswordResetLimits: async () => {}, clearPasswordResetLimits: async () => {},
      consumePasswordResetCompletionLimits: async () => {}, clearPasswordResetCompletionLimits: async () => {},
      createPasswordResetToken: async () => { token = { id: 1, userId: 1, expiresAt: new Date(Date.now() + 60_000) }; return tokenValue; },
    },
    "@/lib/request-validation": { tryReadJsonRequest: async (request: Request) => ({ ok: true, value: await request.json() }) },
    "@/lib/api-errors": { apiErrorResponse: () => Response.json({ error: "unexpected" }, { status: 500 }) },
  });
  const post = (body: object) => route.POST(new Request("http://localhost/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal((await post({ username: "player", answer: "incorrect" })).status, 401);
  assert.equal(token, null);
  const issue = await post({ username: "player", answer: "answer" });
  assert.equal(issue.status, 200); assert.equal((await issue.json()).resetToken, tokenValue);
  const completion = { resetToken: tokenValue, newPassword: "new-password-123", confirmPassword: "new-password-123" };
  assert.equal((await post({ ...completion, newPassword: "中".repeat(25), confirmPassword: "中".repeat(25) })).status, 400);
  assert.equal(account.sessionVersion, 1);
  account.banned = true;
  assert.equal((await post(completion)).status, 400);
  assert.ok(token, "an ineligible account must roll back token consumption");
  assert.equal(account.sessionVersion, 1);
  account.banned = false;
  assert.equal((await post(completion)).status, 200);
  assert.equal(account.passwordHash, "hash:new-password-123"); assert.equal(account.sessionVersion, 2);
  assert.equal((await post(completion)).status, 400, "a reset token can only be consumed once");
  await post({ username: "player", answer: "answer" });
  token = { id: 2, userId: 1, expiresAt: new Date(0) };
  assert.equal((await post(completion)).status, 400, "expired reset credentials must be rejected");
  assert.equal(account.sessionVersion, 2);
}

async function verifyAdministratorRevocation() {
  let adminRole: string | null = "co_owner";
  let isMember = true;
  const events: string[] = [];
  const leaveTx = {
    tournament: { findUnique: async () => ({ status: "recruiting", splitResult: null, deadline: new Date(Date.now() + 60_000) }) },
    tournamentAdmin: {
      findFirst: async () => adminRole === "owner" ? { role: "owner" } : null,
      deleteMany: async () => { adminRole = null; events.push("revoke"); },
    },
    tournamentPlayer: { deleteMany: async () => { const count = Number(isMember); isMember = false; return { count }; } },
  };
  const leave = load<typeof import("../src/features/tournaments/server/leave")>("src/features/tournaments/server/leave.ts", {
    "@/lib/service-error": { ServiceError },
    "@/lib/serializable": { serializable: (operation: (tx: typeof leaveTx) => unknown) => operation(leaveTx) },
    "./lifecycle": { reconcileOrDeleteTournament: async () => { events.push("reconcile"); } },
  });
  await leave.leaveTournament(1, 2);
  assert.equal(adminRole, null); assert.deepEqual(events, ["revoke", "reconcile"]);
  adminRole = "owner"; isMember = true;
  await assert.rejects(leave.leaveTournament(1, 2), /房主不能退出/);
  assert.equal(isMember, true); assert.equal(adminRole, "owner");

  let writes = 0;
  const splitTx = {
    tournamentAdmin: { findUnique: async () => adminRole ? { role: adminRole } : null },
    tournamentPlayer: { findMany: async () => Array.from({ length: 10 }, (_, i) => ({ userId: i + 1 })) },
    tournament: { updateMany: async () => { writes++; return { count: 1 }; } },
    adminOperation: { create: async () => ({}) },
  };
  const split = load<typeof import("../src/features/tournaments/server/split")>("src/features/tournaments/server/split.ts", {
    "@/lib/db": { prisma: { $transaction: (operation: (tx: typeof splitTx) => unknown) => operation(splitTx) } },
  });
  const input = { tournamentId: 1, adminId: 2, expectedPlayerIds: Array.from({ length: 10 }, (_, i) => i + 1), splitData: {} };
  adminRole = null;
  await assert.rejects(split.commitTournamentSplit(input), split.SplitConflictError);
  assert.equal(writes, 0, "worker results cannot commit after administrator resignation");
  adminRole = "co_owner";
  await split.commitTournamentSplit(input); assert.equal(writes, 1);
}

async function verifyTemporaryDisplayName() {
  const players = Array.from({ length: 10 }, (_, i) => ({
    userId: i + 1, isTemporary: i < 2, tempName: i === 0 ? " 补位小明 " : null,
    user: { username: `temp_internal_${i}`, isTemporary: i < 2, heroPowers: [], rolePreferences: [] },
  }));
  const execute = load<typeof import("../src/features/tournaments/server/split-use-case")>("src/features/tournaments/server/split-use-case.ts", {
    "@/lib/db": { prisma: {
      tournamentAdmin: { findUnique: async () => ({ role: "owner" }) },
      tournament: { findUnique: async () => ({ deadline: new Date(), status: "locked", splitResult: null }) },
      tournamentPlayer: { findMany: async () => players },
    } },
    "@/features/tournaments/server/team-balancing-pool": {
      runTeamSplit: async () => ({ strengthCoverage: 10, teamRed: [{ userId: 1, preferenceRank: 1 }, { userId: 2, preferenceRank: 1 }], teamBlue: [] }),
    },
    "@/features/tournaments/server/split": { commitTournamentSplit: async () => {} },
    "@/lib/permissions": {}, "@/lib/service-error": { ServiceError },
  });
  const result = await execute.executeTournamentSplit(1, 2);
  assert.deepEqual(result.playerDetails.slice(0, 2).map(player => player.username), ["补位小明", "临时选手"]);
  assert.deepEqual(result.explanation.assignments.map(player => player.username), ["补位小明", "临时选手"]);
  assert.equal(result.playerDetails[2].username, players[2].user.username);
}

async function verifyVideoMetadataProbe() {
  let status = "published";
  let opened = 0;
  const service = load<typeof import("../src/features/combat-posts/server/service")>("src/features/combat-posts/server/service.ts", {
    "@/features/combat-posts/model": combatModel,
    "@/features/media/server/quota": {}, "@/features/media/server/storage-cleanup": {},
    "@/lib/auth": { requireAuth: async () => ({ userId: 1, role: "user" }) },
    "@/lib/db": { prisma: { combatPost: { findUnique: async () => ({ authorId: 2, status, mimeType: "video/mp4", size: 10, videoStorageKey: "clip" }) } } },
    "@/lib/permissions": {}, "@/lib/service-error": { ServiceError },
    "@/lib/storage": { getMediaStorage: () => ({ stat: async () => ({ size: 10 }), open: async () => { opened++; return null; } }) },
  });
  assert.equal((await service.openCombatPostVideo(1, null, true)).kind, "head");
  assert.equal(opened, 0, "HEAD must authorize/stat without opening a movie stream");
  status = "hidden";
  await assert.rejects(service.openCombatPostVideo(1, null, true), /视频不存在/);
  assert.equal(opened, 0, "metadata probes obey the same visibility rules as playback");
  status = "published";
  assert.equal((await service.openCombatPostVideo(1, "bytes=0-1")).kind, "partial");
  assert.equal(opened, 1, "normal Range playback still opens its media stream");

  const api = load<typeof import("../src/features/combat-posts/client/api")>("src/features/combat-posts/client/api.ts", {
    "@/features/shared/client/api": {},
  });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  let calls = 0;
  let responseStatus = 200;
  let fail = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: new URL("http://localhost:8001/combat/1") } });
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.method, "HEAD"); assert.equal(init.credentials, "same-origin");
    assert.equal(new Headers(init.headers).has("Range"), false);
    if (fail) throw new TypeError("controlled disconnected source");
    return new Response(null, { status: responseStatus, headers: { "content-type": responseStatus === 200 ? "video/mp4" : "application/json" } });
  };
  try {
    const signal = new AbortController().signal;
    assert.equal(await api.inspectCombatVideoSource("/api/combat-posts/1/video", signal), null);
    responseStatus = 404;
    assert.match((await api.inspectCombatVideoSource("/api/combat-posts/1/video", signal))!, /文件不存在/);
    fail = true;
    assert.equal(await api.inspectCombatVideoSource("/api/combat-posts/1/video", signal), null, "diagnostic network failures cannot escape the player");
    const before = calls;
    assert.equal(await api.inspectCombatVideoSource("https://other.invalid/api/combat-posts/1/video", signal), null);
    const aborted = new AbortController(); aborted.abort();
    assert.equal(await api.inspectCombatVideoSource("/api/combat-posts/1/video", aborted.signal), null);
    assert.equal(calls, before, "external or abandoned probes make no request");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

async function main() {
  await verifyRateLimits();
  await verifyPasswordRecovery();
  await verifyScreenshotFailureSafety();
  await verifyAdministratorRevocation();
  await verifyTemporaryDisplayName();
  await verifyVideoMetadataProbe();
  console.log("Review follow-up passed: source limits, password recovery, screenshot safety, administrator revocation, temporary names and authorized video metadata probes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
