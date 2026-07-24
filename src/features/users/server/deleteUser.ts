import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reconcileOrDeleteTournament } from "@/features/tournaments/server/lifecycle";

export async function deleteUserAndOwnedTournamentsInTransaction(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<void> {
  const [memberships, ownedTournaments] = await Promise.all([
    tx.tournamentPlayer.findMany({
      where: { userId },
      select: { tournamentId: true },
    }),
    tx.tournamentAdmin.findMany({
      where: { userId, role: "owner" },
      select: { tournamentId: true },
    }),
  ]);

  const ownedIds = new Set(ownedTournaments.map(({ tournamentId }) => tournamentId));
  if (ownedIds.size > 0) {
    await tx.tournament.deleteMany({
      where: { id: { in: Array.from(ownedIds) } },
    });
  }

  await tx.tournamentPlayer.deleteMany({ where: { userId } });
  await tx.tournamentAdmin.deleteMany({ where: { userId } });
  await tx.tournamentPick.deleteMany({ where: { userId } });
  await tx.tempPlayerApplication.deleteMany({ where: { applicantId: userId } });
  await tx.adminOperation.deleteMany({ where: { adminId: userId } });
  await tx.rolePreference.deleteMany({ where: { userId } });
  await tx.heroPower.deleteMany({ where: { userId } });

  const affectedIds = Array.from(new Set(
    memberships
      .map(({ tournamentId }) => tournamentId)
      .filter((tournamentId) => !ownedIds.has(tournamentId)),
  ));
  for (const tournamentId of affectedIds) {
    await reconcileOrDeleteTournament(tx, tournamentId);
  }

  await tx.user.delete({ where: { id: userId } });
}

export async function deleteUserAndOwnedTournaments(userId: number): Promise<void> {
  await prisma.$transaction((tx) =>
    deleteUserAndOwnedTournamentsInTransaction(tx, userId),
  );
}
