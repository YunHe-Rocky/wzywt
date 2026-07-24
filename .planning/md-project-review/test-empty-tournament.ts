import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";

const ROLLBACK = "ROLLBACK_EMPTY_TOURNAMENT_TEST";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ prisma }, { reconcileOrDeleteTournament }, { deleteUserAndOwnedTournamentsInTransaction }] =
    await Promise.all([
      import("@/lib/db"),
      import("@/features/tournaments/server/lifecycle"),
      import("@/features/users/server/deleteUser"),
    ]);

  try {
    await prisma.$transaction(async (tx) => {
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const owner = await tx.user.create({
        data: { username: `empty_owner_${suffix}`.slice(0, 32), passwordHash: "test" },
      });
      const member = await tx.user.create({
        data: { username: `empty_member_${suffix}`.slice(0, 32), passwordHash: "test" },
      });
      const tournament = await tx.tournament.create({
        data: {
          code: `${Date.now()}`.slice(-8),
          name: "空房间生命周期测试",
          deadline: new Date(Date.now() + 60_000),
          isPublic: true,
          admins: { create: { userId: owner.id, role: "owner" } },
          players: {
            create: [
              { userId: owner.id, isSpectator: false },
              { userId: member.id, isSpectator: false },
            ],
          },
        },
      });

      await tx.tournamentPlayer.delete({
        where: {
          tournamentId_userId: {
            tournamentId: tournament.id,
            userId: member.id,
          },
        },
      });
      const nonEmpty = await reconcileOrDeleteTournament(tx, tournament.id);
      assert.deepEqual(nonEmpty, { deleted: false, playerCount: 1 });

      await deleteUserAndOwnedTournamentsInTransaction(tx, owner.id);
      assert.equal(
        await tx.tournament.findUnique({ where: { id: tournament.id } }),
        null,
      );

      throw new Error(ROLLBACK);
    }, { timeout: 20_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
  } finally {
    await prisma.$disconnect();
  }

  console.log("Empty tournament lifecycle transaction test passed.");
}

void main();
