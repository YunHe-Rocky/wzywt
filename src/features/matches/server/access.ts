import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";
import { getMatchVisibility } from "@/features/matches/visibility";

export type AuthenticatedUser = Awaited<ReturnType<typeof requireAuth>>;

export async function requireTournamentMatchManager(tournamentId: number): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  if (user.role === "admin") return user;
  const assignment = await prisma.tournamentAdmin.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: user.userId } },
    select: { role: true },
  });
  if (!assignment || !["owner", "co_owner"].includes(assignment.role)) throw new PermissionError();
  return user;
}

export async function requireTournamentOwner(tournamentId: number): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  if (user.role === "admin") return user;
  const assignment = await prisma.tournamentAdmin.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: user.userId } },
    select: { role: true },
  });
  if (assignment?.role !== "owner") throw new PermissionError();
  return user;
}

export async function requireMatchManager(
  tournamentId: number,
  matchId: number,
): Promise<AuthenticatedUser> {
  const user = await requireTournamentMatchManager(tournamentId);
  const match = await prisma.internalMatch.findFirst({ where: { id: matchId, tournamentId }, select: { id: true } });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  return user;
}

export async function requireMatchViewer(tournamentId: number, matchId: number) {
  const user = await requireAuth();
  const match = await prisma.internalMatch.findFirst({
    where: { id: matchId, tournamentId },
    select: {
      status: true,
      players: { where: { memberId: user.userId }, select: { memberId: true, side: true } },
      tournament: { select: { admins: { where: { userId: user.userId }, select: { role: true } } } },
    },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  const matchAccess = getMatchVisibility(user, match);
  if (!matchAccess.canViewArchive) throw new PermissionError();
  return { ...user, matchAccess };
}
