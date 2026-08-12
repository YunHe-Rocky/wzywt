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

  console.log("Capacity and split concurrency integration tests passed.");
} finally {
  await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
}
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
