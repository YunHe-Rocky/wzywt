import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const LOBBY_PAGE_SIZE = 20;
const lobbySelect = {
  id: true,
  name: true,
  code: true,
  deadline: true,
  status: true,
  admins: { select: { userId: true, role: true } },
  _count: { select: { players: { where: { isSpectator: false } } } },
} satisfies Prisma.TournamentSelect;

function parseCursor(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const cursor = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(cursor) && cursor > 0 ? cursor : undefined;
}

function pageResult<T extends { id: number }>(rows: T[]) {
  const hasMore = rows.length > LOBBY_PAGE_SIZE;
  const items = rows.slice(0, LOBBY_PAGE_SIZE);
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

export async function listPublicTournaments(limit = 6) {
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
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
  });
}

export async function listTournamentLobbyForUser(
  userId: number,
  cursors: { tournaments?: unknown; publicTournaments?: unknown } = {},
) {
  const tournamentCursor = parseCursor(cursors.tournaments);
  const publicCursor = parseCursor(cursors.publicTournaments);
  const [mineRows, publicRows] = await Promise.all([
    prisma.tournament.findMany({
      where: {
        OR: [{ players: { some: { userId } } }, { admins: { some: { userId } } }],
        status: { not: "finished" },
      },
      select: lobbySelect,
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
      ...(tournamentCursor ? { cursor: { id: tournamentCursor }, skip: 1 } : {}),
      take: LOBBY_PAGE_SIZE + 1,
    }),
    prisma.tournament.findMany({
      where: {
        isPublic: true,
        status: "recruiting",
        players: { some: { isSpectator: false } },
        admins: { some: { role: "owner" } },
        NOT: [
          { players: { some: { userId } } },
          { admins: { some: { userId } } },
        ],
      },
      select: lobbySelect,
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
      ...(publicCursor ? { cursor: { id: publicCursor }, skip: 1 } : {}),
      take: LOBBY_PAGE_SIZE + 1,
    }),
  ]);
  const mine = pageResult(mineRows);
  const publicPage = pageResult(publicRows);
  return {
    tournaments: mine.items,
    publicTournaments: publicPage.items,
    nextCursors: { tournaments: mine.nextCursor, publicTournaments: publicPage.nextCursor },
  };
}