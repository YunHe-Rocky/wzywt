import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  resolveRecruitmentStatus,
  TOURNAMENT_CAPACITY,
} from "@/features/tournaments/model";

export { TOURNAMENT_CAPACITY } from "@/features/tournaments/model";

type TournamentDatabase = Prisma.TransactionClient | typeof prisma;

type CapacityErrorCode =
  | "TOURNAMENT_NOT_FOUND"
  | "TOURNAMENT_CLOSED"
  | "TOURNAMENT_FULL"
  | "PLAYER_EXISTS"
  | "APPLICATION_NOT_FOUND";

export class TournamentCapacityError extends Error {
  constructor(
    readonly code: CapacityErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TournamentCapacityError";
  }
}

async function assertCanAddPlayer(
  tx: Prisma.TransactionClient,
  tournamentId: number,
  userId?: number,
): Promise<number> {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    select: { status: true, deadline: true, splitResult: true },
  });
  if (!tournament) {
    throw new TournamentCapacityError("TOURNAMENT_NOT_FOUND", "赛事不存在", 404);
  }
  if (
    tournament.status !== "recruiting"
    || tournament.deadline.getTime() <= Date.now()
    || tournament.splitResult !== null
  ) {
    throw new TournamentCapacityError("TOURNAMENT_CLOSED", "赛事已截止报名", 400);
  }

  if (userId !== undefined) {
    const existing = await tx.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      select: { id: true },
    });
    if (existing) {
      throw new TournamentCapacityError("PLAYER_EXISTS", "你已在赛事中", 409);
    }
  }

  const playerCount = await tx.tournamentPlayer.count({
    where: { tournamentId, isSpectator: false },
  });
  if (playerCount >= TOURNAMENT_CAPACITY) {
    throw new TournamentCapacityError("TOURNAMENT_FULL", "赛事已满员，报名自动截止", 409);
  }
  return playerCount;
}

async function lockWhenFull(
  tx: Prisma.TransactionClient,
  tournamentId: number,
  playerCount: number,
): Promise<void> {
  if (playerCount < TOURNAMENT_CAPACITY) return;
  await tx.tournament.updateMany({
    where: { id: tournamentId, status: "recruiting" },
    data: { status: "locked" },
  });
}

async function runSerializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2034";
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("unreachable");
}

export async function addRegisteredTournamentPlayer(
  tournamentId: number,
  userId: number,
) {
  return runSerializable(async (tx) => {
    const playerCount = await assertCanAddPlayer(tx, tournamentId, userId);
    const player = await tx.tournamentPlayer.create({
      data: { tournamentId, userId, isSpectator: false },
      include: { user: { select: { id: true, username: true } } },
    });
    await lockWhenFull(tx, tournamentId, playerCount + 1);
    return player;
  });
}

interface AddTemporaryPlayerInput {
  tournamentId: number;
  tempName?: string | null;
  applicationId?: number;
}

export async function addTemporaryTournamentPlayer({
  tournamentId,
  tempName,
  applicationId,
}: AddTemporaryPlayerInput) {
  return runSerializable(async (tx) => {
    let displayName = tempName?.trim() || null;
    if (applicationId !== undefined) {
      const application = await tx.tempPlayerApplication.findFirst({
        where: { id: applicationId, tournamentId, status: "pending" },
        select: { tempName: true },
      });
      if (!application) {
        throw new TournamentCapacityError("APPLICATION_NOT_FOUND", "申请不存在或已处理", 404);
      }
      displayName = application.tempName?.trim() || displayName;
    }

    const playerCount = await assertCanAddPlayer(tx, tournamentId);
    const internalUsername = [
      "temp",
      tournamentId,
      randomBytes(8).toString("hex"),
    ].join("_").slice(0, 32);
    const tempUser = await tx.user.create({
      data: { username: internalUsername, passwordHash: "", isTemporary: true },
    });
    const player = await tx.tournamentPlayer.create({
      data: {
        tournamentId,
        userId: tempUser.id,
        isTemporary: true,
        tempName: displayName,
        isSpectator: false,
      },
    });
    if (applicationId !== undefined) {
      await tx.tempPlayerApplication.update({
        where: { id: applicationId },
        data: { status: "approved" },
      });
    }
    await lockWhenFull(tx, tournamentId, playerCount + 1);
    return player;
  });
}

export async function reconcileTournamentCapacity(
  database: TournamentDatabase,
  tournamentId: number,
  now: Date = new Date(),
): Promise<{ playerCount: number; status: string } | null> {
  const [tournament, playerCount] = await Promise.all([
    database.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, deadline: true, splitResult: true },
    }),
    database.tournamentPlayer.count({
      where: { tournamentId, isSpectator: false },
    }),
  ]);
  if (!tournament) return null;
  if (
    tournament.splitResult !== null
    || !["recruiting", "locked"].includes(tournament.status)
  ) {
    return { playerCount, status: tournament.status };
  }

  const status = resolveRecruitmentStatus({
    currentStatus: tournament.status,
    playerCount,
    deadline: tournament.deadline,
    hasSplitResult: tournament.splitResult !== null,
    now,
  });

  if (status !== tournament.status) {
    await database.tournament.update({
      where: { id: tournamentId },
      data: { status },
    });
  }
  return { playerCount, status };
}
