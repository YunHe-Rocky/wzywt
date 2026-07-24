import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reconcileTournamentCapacity } from "./capacity";

type TournamentDatabase = Prisma.TransactionClient | typeof prisma;

interface TournamentPresence {
  activePlayerCount: number;
  ownerCount: number;
}

export function shouldDeleteTournament({
  activePlayerCount,
  ownerCount,
}: TournamentPresence): boolean {
  return activePlayerCount === 0 || ownerCount === 0;
}

export async function reconcileOrDeleteTournament(
  database: TournamentDatabase,
  tournamentId: number,
): Promise<{ deleted: boolean; playerCount: number }> {
  const [activePlayerCount, ownerCount] = await Promise.all([
    database.tournamentPlayer.count({
      where: { tournamentId, isSpectator: false },
    }),
    database.tournamentAdmin.count({
      where: { tournamentId, role: "owner" },
    }),
  ]);

  if (shouldDeleteTournament({ activePlayerCount, ownerCount })) {
    const result = await database.tournament.deleteMany({
      where: {
        id: tournamentId,
        OR: [
          { players: { none: { isSpectator: false } } },
          { admins: { none: { role: "owner" } } },
        ],
      },
    });
    return { deleted: result.count > 0, playerCount: activePlayerCount };
  }

  await reconcileTournamentCapacity(database, tournamentId);
  return { deleted: false, playerCount: activePlayerCount };
}

export async function deleteOrphanedTournaments(
  database: TournamentDatabase = prisma,
): Promise<number> {
  const result = await database.tournament.deleteMany({
    where: {
      OR: [
        { players: { none: { isSpectator: false } } },
        { admins: { none: { role: "owner" } } },
      ],
    },
  });
  return result.count;
}
