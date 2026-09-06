import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reconcileTournamentCapacity } from "./capacity";

type TournamentDatabase = Prisma.TransactionClient | typeof prisma;

interface TournamentPresence {
  activePlayerCount: number;
  ownerCount: number;
  hasHistory?: boolean;
}

export function shouldDeleteTournament({
  activePlayerCount,
  ownerCount,
  hasHistory = false,
}: TournamentPresence): boolean {
  return !hasHistory && (activePlayerCount === 0 || ownerCount === 0);
}

export async function reconcileOrDeleteTournament(
  database: TournamentDatabase,
  tournamentId: number,
): Promise<{ deleted: boolean; playerCount: number }> {
  const [activePlayerCount, ownerCount, matchCount] = await Promise.all([
    database.tournamentPlayer.count({
      where: { tournamentId, isSpectator: false },
    }),
    database.tournamentAdmin.count({
      where: { tournamentId, role: "owner" },
    }),
    database.internalMatch.count({ where: { tournamentId } }),
  ]);

  const hasHistory = matchCount > 0;
  if (shouldDeleteTournament({ activePlayerCount, ownerCount, hasHistory })) {
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

  if (hasHistory && (activePlayerCount === 0 || ownerCount === 0)) {
    return { deleted: false, playerCount: activePlayerCount };
  }
  await reconcileTournamentCapacity(database, tournamentId);
  return { deleted: false, playerCount: activePlayerCount };
}

export async function deleteOrphanedTournaments(
  database: TournamentDatabase = prisma,
): Promise<number> {
  const result = await database.tournament.deleteMany({
    where: {
      matches: { none: {} },
      OR: [
        { players: { none: { isSpectator: false } } },
        { admins: { none: { role: "owner" } } },
      ],
    },
  });
  return result.count;
}
