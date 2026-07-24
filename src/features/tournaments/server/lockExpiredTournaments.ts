import { prisma } from "@/lib/db";
import { TEMPORARY_CLEANUP_STATUSES } from "@/features/tournaments/model";
import { deleteOrphanedTournaments } from "./lifecycle";

export interface LockedTournament {
  id: number;
  name: string;
  playerCount: number;
  removedTemporaryPlayers: number;
}

export async function lockExpiredTournaments(now: Date = new Date()): Promise<LockedTournament[]> {
  await deleteOrphanedTournaments();
  const expired = await prisma.tournament.findMany({
    where: {
      deadline: { lte: now },
      OR: [
        { status: TEMPORARY_CLEANUP_STATUSES[0] },
        {
          status: TEMPORARY_CLEANUP_STATUSES[1],
          players: { some: { isTemporary: true, user: { isTemporary: true } } },
        },
      ],
    },
    include: {
      players: {
        where: { isTemporary: true, user: { isTemporary: true } },
        select: { userId: true },
      },
      _count: {
        select: {
          players: { where: { isSpectator: false } },
        },
      },
    },
  });

  if (expired.length === 0) return [];

  const temporaryUserIds = Array.from(new Set(
    expired.flatMap((tournament) => tournament.players.map((player) => player.userId)),
  ));

  await prisma.$transaction([
    prisma.user.deleteMany({
      where: {
        id: { in: temporaryUserIds },
        isTemporary: true,
      },
    }),
    ...expired.map((tournament) =>
      prisma.tournament.updateMany({
        where: { id: tournament.id, status: { in: [...TEMPORARY_CLEANUP_STATUSES] } },
        data: { status: "locked" },
      }),
    ),
  ]);

  return expired.map((tournament) => ({
    id: tournament.id,
    name: tournament.name,
    playerCount: tournament._count.players - tournament.players.length,
    removedTemporaryPlayers: tournament.players.length,
  }));
}
