import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export class SplitConflictError extends Error {
  constructor() {
    super("SPLIT_CONFLICT");
    this.name = "SplitConflictError";
  }
}

interface CommitTournamentSplitInput {
  tournamentId: number;
  adminId: number;
  expectedPlayerIds: number[];
  splitData: unknown;
}

export async function commitTournamentSplit({
  tournamentId,
  adminId,
  expectedPlayerIds,
  splitData,
}: CommitTournamentSplitInput): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const currentPlayers = await tx.tournamentPlayer.findMany({
        where: { tournamentId, isSpectator: false },
        select: { userId: true },
        orderBy: { userId: "asc" },
      });
      if (
        currentPlayers.length !== 10
        || currentPlayers.some(({ userId }, index) => userId !== expectedPlayerIds[index])
      ) {
        throw new SplitConflictError();
      }

      const updated = await tx.tournament.updateMany({
        where: {
          id: tournamentId,
          status: { in: ["recruiting", "locked"] },
          splitResult: { equals: Prisma.DbNull },
        },
        data: {
          status: "completed",
          splitResult: splitData as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) throw new SplitConflictError();

      await tx.adminOperation.create({
        data: { tournamentId, adminId, action: "split" },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const serializationConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
    if (error instanceof SplitConflictError || serializationConflict) throw new SplitConflictError();
    throw error;
  }
}
