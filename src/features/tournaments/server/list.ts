import { prisma } from "@/lib/db";

export async function listPublicTournaments(limit?: number) {
  return prisma.tournament.findMany({
    where: {
      isPublic: true,
      status: "recruiting",
      players: { some: { isSpectator: false } },
      admins: { some: { role: "owner" } },
    },
    select: {
      id: true,
      name: true,
      code: true,
      deadline: true,
      status: true,
      announcement: true,
      _count: { select: { players: { where: { isSpectator: false } } } },
    },
    orderBy: { deadline: "asc" },
    ...(limit === undefined ? {} : { take: limit }),
  });
}

export async function listTournamentLobbyForUser(userId: number) {
  const tournaments = await prisma.tournament.findMany({
    where: {
      OR: [
        { players: { some: { userId } } },
        { admins: { some: { userId } } },
      ],
      status: { not: "finished" },
    },
    include: {
      _count: { select: { players: { where: { isSpectator: false } } } },
      admins: { select: { userId: true, role: true } },
    },
    orderBy: { deadline: "asc" },
  });
  const myIds = tournaments.map((tournament) => tournament.id);
  const publicTournaments = await prisma.tournament.findMany({
    where: {
      isPublic: true,
      status: "recruiting",
      id: { notIn: myIds },
      players: { some: { isSpectator: false } },
      admins: { some: { role: "owner" } },
    },
    include: {
      _count: { select: { players: { where: { isSpectator: false } } } },
      admins: { select: { userId: true, role: true } },
    },
    orderBy: { deadline: "asc" },
  });
  return { tournaments, publicTournaments };
}
