import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { addRegisteredTournamentPlayer } from "@/features/tournaments/server/capacity";
import { commitTournamentSplit, SplitConflictError } from "@/features/tournaments/server/split";

const prefix = `ci_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const tournamentIds: number[] = [];
const userIds: number[] = [];

async function main(): Promise<void> {
try {
  for (let index = 0; index < 11; index++) {
    const user = await prisma.user.create({
      data: { username: `${prefix}_${index}`, passwordHash: "integration-test" },
    });
    userIds.push(user.id);
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

  console.log("Capacity, split, match archive, combat post, and tactic integration tests passed.");
} finally {
  await prisma.combatPost.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.internalMatch.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
}
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
