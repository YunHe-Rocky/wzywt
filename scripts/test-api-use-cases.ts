import assert from "node:assert/strict";
import { parseRegistrationInput } from "../src/features/auth/server/register";
import { apiErrorResponse } from "../src/lib/api-errors";
import { ServiceError } from "../src/lib/service-error";
import { mock } from "node:test";
import { prisma } from "../src/lib/db";
import { PermissionError } from "../src/lib/permissions";
import { getTournamentPicksForUser } from "../src/features/tournaments/server/picks";
import { addTemporaryPlayerHeroPowers, manageTournamentAdministrator } from "../src/features/tournaments/server/management";
import type { Prisma } from "@prisma/client";

const registration = parseRegistrationInput({
  username: "  测试用户  ",
  password: "correct-horse-battery",
  confirmPassword: "correct-horse-battery",
  securityQuestion: "__custom__",
  customQuestion: "我的恢复提示？",
  securityAnswer: "  答案  ",
});
assert.equal(registration.username, "测试用户");
assert.equal(registration.securityAnswer, "答案");
assert.throws(() => parseRegistrationInput([]), /注册数据格式错误/);
assert.throws(() => parseRegistrationInput({ ...registration, confirmPassword: "different" }), /两次密码不一致/);

async function verifyErrorContract(): Promise<void> {
  const response = apiErrorResponse(
    new ServiceError("TOO_MANY_REQUESTS", "请稍后重试", { retryAfterSeconds: 7 }),
    { request: new Request("http://localhost/test", { headers: { "x-request-id": "test-request-1234" } }), useCase: "contract.test", startedAt: Date.now() },
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "7");
  assert.equal(response.headers.get("x-request-id"), "test-request-1234");
  assert.deepEqual(await response.json(), {
    error: "请稍后重试",
    code: "TOO_MANY_REQUESTS",
    requestId: "test-request-1234",
    details: { retryAfterSeconds: 7 },
  });
}

async function verifyPrivateTournamentPicks(): Promise<void> {
  let room: { players: { id: number }[]; admins: { id: number }[] } | null = null;
  const roomQuery = mock.fn(async (_query: unknown) => room);
  const picksQuery = mock.fn(async () => [
    { id: 1, tournamentId: 9, userId: 7, heroId: 101, team: "red", roleType: "top", equipJson: [] },
  ]);
  const originals = [prisma.tournament.findUnique, prisma.tournamentPick.findMany, prisma.hero.findMany];
  // Prisma's delegates are Proxy methods without property descriptors; assign the
  // test doubles through the Proxy and restore them without touching a database.
  Reflect.set(prisma.tournament, "findUnique", roomQuery);
  Reflect.set(prisma.tournamentPick, "findMany", picksQuery);
  Reflect.set(prisma.hero, "findMany", async () => [{ heroId: 101, name: "测试英雄" }]);
  try {
    await assert.rejects(() => getTournamentPicksForUser(9, 7), (error: unknown) => error instanceof ServiceError && error.status === 404);
    room = { players: [], admins: [] };
    await assert.rejects(() => getTournamentPicksForUser(9, 7), PermissionError);
    assert.equal(picksQuery.mock.callCount(), 0, "outsiders and missing rooms must not query private lineups");
    for (const membership of [{ players: [{ id: 1 }], admins: [] }, { players: [], admins: [{ id: 2 }] }]) {
      room = membership;
      const result = await getTournamentPicksForUser(9, 7);
      assert.equal(result[0].heroName, "测试英雄");
      const args = roomQuery.mock.calls.at(-1)?.arguments[0];
      assert.deepEqual(args, {
        where: { id: 9 },
        select: { players: { where: { userId: 7 }, select: { id: true } }, admins: { where: { userId: 7 }, select: { id: true } } },
      }, "membership lookup must be scoped to both the requested room and authenticated user");
    }
  } finally {
    Reflect.set(prisma.tournament, "findUnique", originals[0]);
    Reflect.set(prisma.tournamentPick, "findMany", originals[1]);
    Reflect.set(prisma.hero, "findMany", originals[2]);
  }
}

async function verifyTournamentManagementBoundaries(): Promise<void> {
  let actorRole: string | null = "owner";
  let targetRole: string | null = null;
  type Member = { isTemporary: boolean; isSpectator: boolean; user: { isTemporary: boolean; banned: boolean; deletedAt: Date | null } };
  let member: Member | null = { isTemporary: false, isSpectator: false, user: { isTemporary: false, banned: false, deletedAt: null } };
  let existing: { roleType: string; heroId: number }[] = [];
  const tx = {
    tournamentAdmin: {
      findUnique: mock.fn(async (query: { where: { tournamentId_userId: { tournamentId: number; userId: number } } }) => {
        assert.equal(query.where.tournamentId_userId.tournamentId, 9);
        const role = query.where.tournamentId_userId.userId === 7 ? actorRole : targetRole;
        return role ? { role } : null;
      }),
      upsert: mock.fn(async (_query: unknown) => ({})),
      deleteMany: mock.fn(async (_query: unknown) => ({ count: 1 })),
    },
    tournamentPlayer: { findUnique: mock.fn(async (query: unknown) => {
      assert.deepEqual((query as { where: unknown }).where, { tournamentId_userId: { tournamentId: 9, userId: 8 } });
      return member;
    }) },
    heroPower: {
      findMany: mock.fn(async (_query: unknown) => existing),
      createMany: mock.fn(async (_query: unknown) => ({ count: 1 })),
    },
  };
  const original = prisma.$transaction;
  Reflect.set(prisma, "$transaction", async (operation: (client: Prisma.TransactionClient) => Promise<void>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable" }, "authorization checks and writes must share a transaction");
    return operation(tx as unknown as Prisma.TransactionClient);
  });
  const power = { roleType: "top", heroId: 101, heroName: " 测试英雄 ", powerScore: 5000 };
  const editPowers = (heroPowers: unknown = [power]) => addTemporaryPlayerHeroPowers(9, 7, { targetUserId: 8, heroPowers });
  const promote = () => manageTournamentAdministrator(9, 7, { targetUserId: 8, action: "promote" });
  const validationError = (error: unknown) => error instanceof ServiceError && error.status === 400;
  try {
    for (const action of ["promote", "demote"]) {
      await assert.rejects(() => manageTournamentAdministrator(9, 7, { targetUserId: 7, action }), validationError);
    }
    assert.equal(tx.tournamentAdmin.upsert.mock.callCount(), 0, "owner may never overwrite their own role");
    assert.equal(tx.tournamentAdmin.deleteMany.mock.callCount(), 0);
    actorRole = "co_owner";
    await assert.rejects(promote, PermissionError);
    actorRole = null;
    await assert.rejects(editPowers, PermissionError);
    actorRole = "owner";
    const regularMember = member!;
    for (const invalidMember of [null, { ...regularMember, isTemporary: true }, { ...regularMember, isSpectator: true }, { ...regularMember, user: { ...regularMember.user, banned: true } }]) {
      member = invalidMember;
      await assert.rejects(promote, validationError);
    }
    member = regularMember;
    await promote();
    assert.equal(tx.tournamentAdmin.upsert.mock.callCount(), 1);
    targetRole = "co_owner";
    await manageTournamentAdministrator(9, 7, { targetUserId: 8, action: "demote" });
    assert.deepEqual(tx.tournamentAdmin.deleteMany.mock.calls[0].arguments[0], { where: { tournamentId: 9, userId: 8, role: "co_owner" } });

    for (const invalidMember of [null, regularMember, { ...regularMember, isTemporary: true }]) {
      member = invalidMember;
      await assert.rejects(editPowers, PermissionError);
    }
    assert.equal(tx.heroPower.createMany.mock.callCount(), 0, "a room admin cannot write another room or registered user's powers");
    member = { ...regularMember, isTemporary: true, user: { ...regularMember.user, isTemporary: true } };
    for (const invalid of [undefined, null, {}, [null], [power, power], [{ ...power, powerScore: true }], [{ ...power, powerScore: 1_000_000 }], [{ ...power, roleType: "invalid" }], [{ ...power, heroId: 2_147_483_648 }], [{ ...power, heroName: "a".repeat(65) }]]) {
      await assert.rejects(() => addTemporaryPlayerHeroPowers(9, 7, { targetUserId: 8, heroPowers: invalid }), validationError);
    }
    existing = [{ roleType: "top", heroId: 102 }, { roleType: "top", heroId: 103 }, { roleType: "top", heroId: 104 }];
    await assert.rejects(editPowers, validationError);
    existing = [{ roleType: "top", heroId: 101 }];
    await assert.rejects(editPowers, (error: unknown) => error instanceof ServiceError && error.status === 409);
    assert.equal(tx.heroPower.createMany.mock.callCount(), 0, "invalid batches must perform no partial writes");
    existing = [];
    await editPowers();
    assert.deepEqual(tx.heroPower.createMany.mock.calls[0].arguments[0], { data: [{ userId: 8, ...power, heroName: "测试英雄" }] });
  } finally {
    Reflect.set(prisma, "$transaction", original);
  }
}

Promise.resolve().then(verifyErrorContract).then(verifyPrivateTournamentPicks).then(verifyTournamentManagementBoundaries).then(() => console.log("API and use-case contract tests passed.")).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
