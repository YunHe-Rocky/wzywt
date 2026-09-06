import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { addRegisteredTournamentPlayer } from "@/features/tournaments/server/capacity";
import { commitTournamentSplit, SplitConflictError } from "@/features/tournaments/server/split";
import { completeMatchRecognition, recoverInterruptedRecognitions } from "@/features/matches/server/recognition";
import { applyMatchCorrection } from "@/features/matches/server/records";
import { deleteUserAndOwnedTournaments } from "@/features/users/server/deleteUser";
import { releaseMediaReservation, reserveMediaUpload } from "@/features/media/server/quota";
import { ServiceError } from "@/lib/service-error";

function assertSafeIntegrationDatabase(): void {
  if (process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "1") {
    throw new Error("拒绝运行集成测试：必须显式设置 ALLOW_INTEGRATION_TEST_DATABASE=1");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("拒绝运行集成测试：DATABASE_URL 未配置");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "").split("?")[0].toLowerCase();
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (!localHost || (!database.endsWith("_ci") && !database.endsWith("_test"))) {
    throw new Error(`拒绝运行集成测试：仅允许本机 *_ci 或 *_test 数据库（当前 ${url.hostname}/${database || "<empty>"}）`);
  }
}

const prefix = `ci_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const tournamentIds: number[] = [];
const userIds: number[] = [];
const heroIds: number[] = [];

async function main(): Promise<void> {
assertSafeIntegrationDatabase();
try {
  for (let index = 0; index < 11; index++) {
    const user = await prisma.user.create({
      data: { username: `${prefix}_${index}`, passwordHash: "integration-test" },
    });
    userIds.push(user.id);
  }

  const quotaEnvironment = {
    userStored: process.env.MEDIA_USER_STORED_QUOTA_BYTES,
    userDaily: process.env.MEDIA_USER_DAILY_QUOTA_BYTES,
    globalStored: process.env.MEDIA_GLOBAL_STORED_QUOTA_BYTES,
    minimumFree: process.env.MEDIA_MIN_FREE_BYTES,
  };
  Reflect.set(process.env, "MEDIA_USER_STORED_QUOTA_BYTES", "100");
  Reflect.set(process.env, "MEDIA_USER_DAILY_QUOTA_BYTES", "100");
  Reflect.set(process.env, "MEDIA_GLOBAL_STORED_QUOTA_BYTES", "1000000");
  Reflect.set(process.env, "MEDIA_MIN_FREE_BYTES", "0");
  try {
    const reservations = await Promise.allSettled([
      reserveMediaUpload(userIds[0], "match-screenshot", 80),
      reserveMediaUpload(userIds[0], "match-screenshot", 80),
    ]);
    assert.equal(reservations.filter(({ status }) => status === "fulfilled").length, 1, "concurrent quota reservations must not oversell");
    const quotaFailure = reservations.find(({ status }) => status === "rejected");
    assert.ok(quotaFailure && quotaFailure.status === "rejected" && quotaFailure.reason instanceof ServiceError && quotaFailure.reason.code === "PAYLOAD_TOO_LARGE");
    const accepted = reservations.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof reserveMediaUpload>>> => result.status === "fulfilled");
    if (accepted) await releaseMediaReservation(accepted.value.id, userIds[0]);
  } finally {
    for (const [key, value] of Object.entries({
      MEDIA_USER_STORED_QUOTA_BYTES: quotaEnvironment.userStored,
      MEDIA_USER_DAILY_QUOTA_BYTES: quotaEnvironment.userDaily,
      MEDIA_GLOBAL_STORED_QUOTA_BYTES: quotaEnvironment.globalStored,
      MEDIA_MIN_FREE_BYTES: quotaEnvironment.minimumFree,
    })) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }

  const capacityTournament = await prisma.tournament.create({
    data: {
      name: `${prefix}_capacity`,
      code: randomUUID().replaceAll("-", "").slice(0, 8),
      deadline: new Date(Date.now() + 60 * 60 * 1000),
      players: { create: userIds.slice(0, 9).map((userId) => ({ userId })) },
      admins: { create: { userId: userIds[0], role: "owner" } },
    },
  });
  tournamentIds.push(capacityTournament.id);

  const capacityResults = await Promise.allSettled([
    addRegisteredTournamentPlayer(capacityTournament.id, userIds[9]),
    addRegisteredTournamentPlayer(capacityTournament.id, userIds[10]),
  ]);
  assert.equal(capacityResults.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(await prisma.tournamentPlayer.count({
    where: { tournamentId: capacityTournament.id, isSpectator: false },
  }), 10);

  const splitTournament = await prisma.tournament.create({
    data: {
      name: `${prefix}_split`,
      code: randomUUID().replaceAll("-", "").slice(0, 8),
      deadline: new Date(Date.now() + 60 * 60 * 1000),
      status: "locked",
      players: { create: userIds.slice(0, 10).map((userId) => ({ userId })) },
      admins: {
        create: [
          { userId: userIds[0], role: "owner" },
          { userId: userIds[1], role: "co_owner" },
        ],
      },
    },
  });
  tournamentIds.push(splitTournament.id);
  const expectedPlayerIds = [...userIds.slice(0, 10)].sort((a, b) => a - b);
  const splitData = { version: 2, teamRed: [], teamBlue: [] };
  const splitResults = await Promise.allSettled([
    commitTournamentSplit({
      tournamentId: splitTournament.id,
      adminId: userIds[0],
      expectedPlayerIds,
      splitData,
    }),
    commitTournamentSplit({
      tournamentId: splitTournament.id,
      adminId: userIds[1],
      expectedPlayerIds,
      splitData,
    }),
  ]);
  assert.equal(splitResults.filter(({ status }) => status === "fulfilled").length, 1);
  const rejection = splitResults.find(({ status }) => status === "rejected");
  assert.ok(rejection && rejection.status === "rejected" && rejection.reason instanceof SplitConflictError);

  const persisted = await prisma.tournament.findUniqueOrThrow({
    where: { id: splitTournament.id },
    select: { splitResult: true, status: true },
  });
  assert.equal(persisted.status, "completed");
  assert.notEqual(persisted.splitResult, null);
  assert.equal(await prisma.adminOperation.count({
    where: { tournamentId: splitTournament.id, action: "split" },
  }), 1);

  const match = await prisma.internalMatch.create({
    data: {
      tournamentId: splitTournament.id,
      createdById: userIds[0],
      players: {
        create: userIds.slice(0, 10).map((memberId, index) => ({
          memberId,
          side: index < 5 ? "red" : "blue",
          slot: (index % 5) + 1,
          gameNickname: `${prefix}_p${index}`,
          roleType: ["top", "jungle", "mid", "adc", "support"][index % 5],
        })),
      },
      tacticRooms: { create: [{ side: "red" }, { side: "blue" }] },
    },
    include: { players: true, tacticRooms: true },
  });
  assert.equal(match.players.length, 10);
  assert.equal(match.tacticRooms.length, 2);

  const recognition = await prisma.matchRecognition.create({
    data: {
      matchId: match.id,
      status: "RUNNING",
      engine: "integration",
      evidenceRevision: match.evidenceRevision,
      inputSnapshot: [],
      startedById: userIds[0],
      startedAt: new Date(),
    },
  });
  await prisma.internalMatch.update({
    where: { id: match.id },
    data: { status: "SUBMITTED", activeRecognitionId: recognition.id, redTotalKills: 5, blueTotalKills: 5 },
  });
  const lateRecognition = await completeMatchRecognition({
    recognitionId: recognition.id,
    matchId: match.id,
    raw: { pages: [] },
    normalized: { version: 1, consistencyStatus: "PASS", players: [], warnings: [], conflicts: [] },
  });
  assert.equal(lateRecognition.status, "SUPERSEDED");
  const preservedSubmitted = await prisma.internalMatch.findUniqueOrThrow({ where: { id: match.id } });
  assert.equal(preservedSubmitted.status, "SUBMITTED", "late OCR must not rewind a submitted match");
  assert.equal(preservedSubmitted.activeRecognitionId, recognition.id, "stale completion must not mutate the newer match state");

  const interruptedRecognition = await prisma.matchRecognition.create({
    data: {
      matchId: match.id,
      status: "RUNNING",
      engine: "integration-recovery",
      evidenceRevision: match.evidenceRevision,
      inputSnapshot: [],
      startedById: userIds[0],
      attemptCount: 1,
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
      heartbeatAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });
  await prisma.internalMatch.update({ where: { id: match.id }, data: { activeRecognitionId: interruptedRecognition.id } });
  assert.equal(await recoverInterruptedRecognitions(new Date()), 1);
  const recoveredRecognition = await prisma.matchRecognition.findUniqueOrThrow({ where: { id: interruptedRecognition.id } });
  assert.equal(recoveredRecognition.status, "QUEUED");
  assert.equal(recoveredRecognition.errorCode, "WORKER_INTERRUPTED");
  assert.equal(recoveredRecognition.startedAt, null);
  await prisma.$transaction([
    prisma.matchRecognition.update({ where: { id: interruptedRecognition.id }, data: { status: "SUPERSEDED", finishedAt: new Date() } }),
    prisma.internalMatch.update({ where: { id: match.id }, data: { activeRecognitionId: null } }),
  ]);

  await prisma.matchPlayerStat.createMany({
    data: match.players.map((player) => ({ matchPlayerId: player.id, kills: 1, confirmedAt: new Date(), confirmedById: userIds[0] })),
  });
  const redPlayer = await prisma.matchPlayer.findFirstOrThrow({
    where: { matchId: match.id, side: "red" },
    include: { stats: true },
  });
  assert.ok(redPlayer.stats);
  const correction = await applyMatchCorrection({ userId: userIds[0], role: "admin" }, match.id, {
    matchPlayerId: redPlayer.id,
    field: "kills",
    value: 3,
    reason: "集成测试纠正击杀",
    expectedUpdatedAt: redPlayer.stats.updatedAt.toISOString(),
    expectedMatchRevision: 1,
  });
  assert.equal(correction.matchRevision, 2);
  assert.equal(correction.teamTotalKills, 7);
  const totalsAfterCorrection = await prisma.internalMatch.findUniqueOrThrow({ where: { id: match.id } });
  assert.equal(totalsAfterCorrection.redTotalKills, 7);
  assert.equal(totalsAfterCorrection.recordRevision, 2);

  const bluePlayer = await prisma.matchPlayer.findFirstOrThrow({
    where: { matchId: match.id, side: "blue" },
    include: { stats: true },
  });
  const blueStatsUpdatedAt = bluePlayer.stats?.updatedAt;
  assert.ok(blueStatsUpdatedAt);
  await assert.rejects(() => applyMatchCorrection({ userId: userIds[0], role: "admin" }, match.id, {
    matchPlayerId: bluePlayer.id,
    field: "kills",
    value: 2,
    reason: "过期整场修订号",
    expectedUpdatedAt: blueStatsUpdatedAt.toISOString(),
    expectedMatchRevision: 1,
  }), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");

  const hero = await prisma.hero.create({
    data: {
      heroId: Number(`9${Date.now().toString().slice(-7)}`),
      name: `${prefix}_hero`,
      title: "integration",
      roleType: "mid",
      imageUrl: "integration.png",
      skillsJson: "[]",
    },
  });
  heroIds.push(hero.heroId);
  const heroPlayer = await prisma.matchPlayer.update({
    where: { id: bluePlayer.id },
    data: { heroId: hero.heroId, heroName: hero.name },
  });
  await applyMatchCorrection({ userId: userIds[0], role: "admin" }, match.id, {
    matchPlayerId: heroPlayer.id,
    field: "heroName",
    value: "人工纠正英雄",
    reason: "集成测试英雄纠错",
    expectedUpdatedAt: heroPlayer.updatedAt.toISOString(),
    expectedMatchRevision: 2,
  });
  const correctedHero = await prisma.matchPlayer.findUniqueOrThrow({ where: { id: heroPlayer.id } });
  assert.equal(correctedHero.heroId, null, "manual hero-name correction must detach the stale Hero relation");
  assert.equal(correctedHero.heroName, "人工纠正英雄");

  await prisma.matchScreenshot.create({
    data: {
      matchId: match.id,
      type: "DATA",
      storageKey: `match-screenshots/2026/08/${prefix}-data.png`,
      originalFilename: "data.png",
      mimeType: "image/png",
      size: 8,
      sha256: "a".repeat(64),
      uploadedById: userIds[0],
    },
  });
  await assert.rejects(() => prisma.matchScreenshot.create({
    data: {
      matchId: match.id,
      type: "DATA",
      storageKey: `match-screenshots/2026/08/${prefix}-duplicate.png`,
      originalFilename: "duplicate.png",
      mimeType: "image/png",
      size: 8,
      sha256: "b".repeat(64),
      uploadedById: userIds[0],
    },
  }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002");

  const post = await prisma.combatPost.create({
    data: {
      authorId: userIds[0],
      matchId: match.id,
      tournamentId: splitTournament.id,
      title: `${prefix}_post`,
      content: "integration content",
      videoStorageKey: `post-videos/2026/08/${prefix}.mp4`,
      originalFilename: "clip.mp4",
      mimeType: "video/mp4",
      size: 12,
      sha256: "c".repeat(64),
    },
  });
  await prisma.combatPostLike.create({ data: { postId: post.id, userId: userIds[1] } });
  await assert.rejects(
    () => prisma.combatPostLike.create({ data: { postId: post.id, userId: userIds[1] } }),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002",
  );

  const redRoom = match.tacticRooms.find(({ side }) => side === "red");
  assert.ok(redRoom);
  const layer = await prisma.tacticLayer.create({
    data: { roomId: redRoom.id, name: "开局", sortOrder: 0, createdById: userIds[0] },
  });
  await prisma.tacticRoute.create({
    data: { layerId: layer.id, ownerMemberId: userIds[0], colorKey: "crimson", geometry: { version: 1, arrow: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } },
  });
  await assert.rejects(() => prisma.tacticRoute.create({
    data: { layerId: layer.id, ownerMemberId: userIds[0], colorKey: "crimson", geometry: { version: 1, arrow: true, points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] } },
  }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002");

  await assert.rejects(
    () => deleteUserAndOwnedTournaments(userIds[0]),
    (error: unknown) => error instanceof ServiceError && error.code === "BUSINESS_VALIDATION_FAILED",
    "room owners must transfer or delete their room before account deletion",
  );
  const anonymized = await deleteUserAndOwnedTournaments(userIds[9]);
  assert.equal(anonymized.mode, "anonymized");
  const historicalUser = await prisma.user.findUniqueOrThrow({ where: { id: userIds[9] } });
  assert.ok(historicalUser.deletedAt);
  assert.equal(historicalUser.isTemporary, true);
  assert.equal(await prisma.matchPlayer.count({ where: { matchId: match.id, memberId: userIds[9] } }), 1, "historical match membership must remain intact");

  const disposable = await prisma.user.create({ data: { username: `${prefix}_disposable`, passwordHash: "integration-test" } });
  userIds.push(disposable.id);
  assert.equal((await deleteUserAndOwnedTournaments(disposable.id)).mode, "deleted");
  assert.equal(await prisma.user.findUnique({ where: { id: disposable.id } }), null);

  console.log("Capacity, split, match state/correction/account lifecycle, combat post, and tactic integration tests passed.");
} finally {
  await prisma.combatPost.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.adminOperation.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  await prisma.internalMatch.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.hero.deleteMany({ where: { heroId: { in: heroIds } } });
  await prisma.$disconnect();
}
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
