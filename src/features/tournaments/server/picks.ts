import { prisma } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";

/** Lineups belong to a room; a cookie's presence alone never grants access. */
export async function getTournamentPicksForUser(tournamentId: number, userId: number) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      players: { where: { userId }, select: { id: true } },
      admins: { where: { userId }, select: { id: true } },
    },
  });
  if (!tournament) throw new ServiceError("NOT_FOUND", "赛事不存在");
  if (!tournament.players.length && !tournament.admins.length) throw new PermissionError();

  const picks = await prisma.tournamentPick.findMany({
    where: { tournamentId },
    orderBy: { team: "asc" },
  });
  const heroIds = Array.from(new Set(picks.map((pick) => pick.heroId)));
  const heroes = await prisma.hero.findMany({
    where: { heroId: { in: heroIds } },
    select: { heroId: true, name: true },
  });
  const heroMap = new Map(heroes.map((hero) => [hero.heroId, hero]));
  return picks.map((pick) => ({ ...pick, heroName: heroMap.get(pick.heroId)?.name || "?" }));
}
