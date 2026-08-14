import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseSplitSnapshot, type MatchScreenshotType } from "@/features/matches/model";
import { deleteOrQueueMedia } from "@/features/media/server/storage-cleanup";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateScreenshotFile } from "@/lib/media-validation";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";
import { getMediaStorage } from "@/lib/storage";
import { requireMatchManager, requireMatchViewer, requireTournamentMatchManager } from "./access";

function parsePlayedAt(value: unknown): Date {
  if (value === undefined || value === null || value === "") return new Date();
  if (typeof value !== "string") throw new ServiceError("VALIDATION_ERROR", "比赛时间格式错误");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ServiceError("VALIDATION_ERROR", "比赛时间格式错误");
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new ServiceError("VALIDATION_ERROR", "比赛时间不能超过未来 24 小时");
  return date;
}

export async function createMatchDraft(tournamentId: number, playedAt?: unknown) {
  const actor = await requireTournamentMatchManager(tournamentId);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      splitResult: true,
      players: {
        where: { isSpectator: false },
        select: {
          userId: true,
          isTemporary: true,
          tempName: true,
          user: { select: { username: true, gameNickname: true, isTemporary: true } },
        },
      },
      picks: { select: { userId: true, heroId: true, roleType: true } },
    },
  });
  if (!tournament) throw new ServiceError("NOT_FOUND", "赛事不存在");
  const split = parseSplitSnapshot(tournament.splitResult);
  if (!split) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "赛事尚无有效的十人分队结果");
  if (tournament.players.length !== 10) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "当前参赛成员不是 10 人");
  const playerById = new Map(tournament.players.map((player) => [player.userId, player]));
  const pickById = new Map(tournament.picks.map((pick) => [pick.userId, pick]));
  const heroIds = Array.from(new Set(tournament.picks.map(({ heroId }) => heroId).filter((id) => id > 0)));
  const heroes = heroIds.length
    ? await prisma.hero.findMany({ where: { heroId: { in: heroIds } }, select: { heroId: true, name: true } })
    : [];
  const heroNameById = new Map(heroes.map((hero) => [hero.heroId, hero.name]));
  const playerCreates = split.map((slot) => {
    const participant = playerById.get(slot.userId);
    if (!participant) throw new ServiceError("CONFLICT", "分队成员与当前赛事成员不一致");
    const guest = participant.isTemporary || participant.user.isTemporary;
    const pick = pickById.get(slot.userId);
    return {
      side: slot.side,
      slot: slot.slot,
      memberId: guest ? null : slot.userId,
      isGuest: guest,
      gameNickname: (participant.tempName || participant.user.gameNickname || participant.user.username).slice(0, 32),
      heroId: pick?.heroId && heroNameById.has(pick.heroId) ? pick.heroId : null,
      heroName: pick?.heroId ? heroNameById.get(pick.heroId) ?? null : null,
      roleType: pick?.roleType || slot.roleType,
    };
  });
  try {
    return await prisma.internalMatch.create({
      data: {
        tournamentId,
        playedAt: parsePlayedAt(playedAt),
        createdById: actor.userId,
        players: { create: playerCreates },
        tacticRooms: { create: [{ side: "red" }, { side: "blue" }] },
      },
      select: { id: true, tournamentId: true, status: true, playedAt: true, createdAt: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ServiceError("CONFLICT", "该赛事已经创建比赛档案");
    }
    throw error;
  }
}

export async function listTournamentMatches(tournamentId: number) {
  const user = await requireAuth();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { admins: { where: { userId: user.userId }, select: { id: true } } },
  });
  if (!tournament) throw new ServiceError("NOT_FOUND", "赛事不存在");
  const privileged = user.role === "admin" || tournament.admins.length > 0;
  return prisma.internalMatch.findMany({
    where: {
      tournamentId,
      ...(privileged ? {} : { OR: [{ status: "SUBMITTED" }, { players: { some: { memberId: user.userId } } }] }),
    },
    orderBy: { playedAt: "desc" },
    select: {
      id: true,
      playedAt: true,
      status: true,
      winnerSide: true,
      redTotalKills: true,
      blueTotalKills: true,
      consistencyStatus: true,
      submittedAt: true,
      _count: { select: { screenshots: true, players: true, combatPosts: true } },
    },
  });
}

function numberOrNull(value: { toString(): string } | number | null): number | null {
  return value === null ? null : Number(value.toString());
}

export async function getMatchDetail(tournamentId: number, matchId: number) {
  const user = await requireMatchViewer(tournamentId, matchId);
  const match = await prisma.internalMatch.findFirst({
    where: { id: matchId, tournamentId },
    include: {
      tournament: {
        select: {
          name: true,
          admins: { where: { userId: user.userId }, select: { role: true } },
          players: {
            where: { isSpectator: false, isTemporary: false, user: { isTemporary: false } },
            orderBy: { id: "asc" },
            select: {
              userId: true,
              user: { select: { username: true, gameNickname: true } },
            },
          },
        },
      },
      players: {
        orderBy: [{ side: "desc" }, { slot: "asc" }],
        include: {
          member: { select: { id: true, username: true } },
          hero: { select: { heroId: true, name: true, imageUrl: true } },
          stats: true,
        },
      },
      screenshots: { orderBy: { type: "asc" }, select: { id: true, type: true, originalFilename: true, mimeType: true, size: true, sha256: true, recognitionStatus: true, createdAt: true } },
      recognitions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, engine: true, normalizedResult: true, warnings: true, errorCode: true, createdAt: true, finishedAt: true } },
      disputes: { where: { createdById: user.userId }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  const canManage = user.role === "admin" || match.tournament.admins.some(({ role }) => role === "owner" || role === "co_owner");
  return {
    match: {
      id: match.id,
      tournamentId: match.tournamentId,
      tournamentName: match.tournament.name,
      playedAt: match.playedAt,
      status: match.status,
      winnerSide: match.winnerSide,
      redTotalKills: match.redTotalKills,
      blueTotalKills: match.blueTotalKills,
      consistencyStatus: match.consistencyStatus,
      consistencyDetails: match.consistencyDetails,
      submittedAt: match.submittedAt,
      updatedAt: match.updatedAt,
      players: match.players.map((player) => ({
        id: player.id,
        side: player.side,
        slot: player.slot,
        memberId: player.memberId,
        member: player.member,
        isGuest: player.isGuest,
        gameNickname: player.gameNickname,
        heroId: player.heroId,
        heroName: player.hero?.name || player.heroName,
        heroImageUrl: player.hero?.imageUrl || null,
        roleType: player.roleType,
        score: numberOrNull(player.score),
        identityConfirmedAt: player.identityConfirmedAt,
        stats: player.stats ? {
          damageDealt: player.stats.damageDealt,
          damageTaken: player.stats.damageTaken,
          gold: player.stats.gold,
          participationRate: numberOrNull(player.stats.participationRate),
          damageConversionRate: numberOrNull(player.stats.damageConversionRate),
          damageTakenPerDeath: player.stats.damageTakenPerDeath,
          jungleGold: player.stats.jungleGold,
          minionKills: player.stats.minionKills,
          kills: player.stats.kills,
          deaths: player.stats.deaths,
          assists: player.stats.assists,
          controlScore: numberOrNull(player.stats.controlScore),
          healing: player.stats.healing,
          towerDamage: player.stats.towerDamage,
          confirmedAt: player.stats.confirmedAt,
          updatedAt: player.stats.updatedAt,
        } : null,
        updatedAt: player.updatedAt,
      })),
      screenshots: match.screenshots,
      recognition: match.recognitions[0] ?? null,
      disputes: match.disputes,
    },
    access: { canManage, isSuperAdmin: user.role === "admin" },
    eligibleMembers: match.tournament.players.map(({ userId, user: member }) => ({
      id: userId,
      username: member.username,
      gameNickname: member.gameNickname,
    })),
  };
}

export async function uploadMatchScreenshot(
  tournamentId: number,
  matchId: number,
  type: MatchScreenshotType,
  file: File,
) {
  const actor = await requireMatchManager(tournamentId, matchId);
  const currentMatch = await prisma.internalMatch.findUnique({ where: { id: matchId }, select: { status: true } });
  if (!currentMatch) throw new ServiceError("NOT_FOUND", "比赛不存在");
  if (currentMatch.status === "SUBMITTED") throw new ServiceError("CONFLICT", "正式比赛档案不能替换原始截图");
  const media = await validateScreenshotFile(file);
  const storage = getMediaStorage();
  const stored = await storage.save({ namespace: "match-screenshots", extension: media.extension, data: media.data });
  const sha256 = createHash("sha256").update(media.data).digest("hex");
  const previous = await prisma.matchScreenshot.findUnique({
    where: { matchId_type: { matchId, type } },
    select: { storageKey: true },
  });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const screenshot = await tx.matchScreenshot.upsert({
        where: { matchId_type: { matchId, type } },
        create: {
          matchId,
          type,
          storageKey: stored.key,
          originalFilename: media.originalFilename,
          mimeType: media.mimeType,
          size: stored.size,
          sha256,
          uploadedById: actor.userId,
          recognitionStatus: "PENDING",
        },
        update: {
          storageKey: stored.key,
          originalFilename: media.originalFilename,
          mimeType: media.mimeType,
          size: stored.size,
          sha256,
          uploadedById: actor.userId,
          recognitionStatus: "PENDING",
          recognitionPayload: Prisma.DbNull,
        },
        select: { id: true, type: true, originalFilename: true, mimeType: true, size: true, sha256: true, recognitionStatus: true, createdAt: true },
      });
      const count = await tx.matchScreenshot.count({ where: { matchId } });
      await tx.internalMatch.update({
        where: { id: matchId },
        data: { status: count === 6 ? "UPLOADED" : "DRAFT", consistencyStatus: "PENDING", consistencyDetails: Prisma.DbNull },
      });
      return screenshot;
    });
    if (previous && previous.storageKey !== stored.key) await deleteOrQueueMedia(storage, previous.storageKey, "screenshot-replaced");
    return result;
  } catch (error) {
    await deleteOrQueueMedia(storage, stored.key, "screenshot-database-failure");
    throw error;
  }
}

export async function getMatchScreenshotForAdmin(tournamentId: number, matchId: number, type: MatchScreenshotType) {
  const user = await requireAuth();
  if (user.role !== "admin") throw new PermissionError();
  const screenshot = await prisma.matchScreenshot.findFirst({
    where: { matchId, type, match: { tournamentId } },
    select: { storageKey: true, mimeType: true, size: true, originalFilename: true },
  });
  if (!screenshot) throw new ServiceError("NOT_FOUND", "原始截图不存在");
  const storage = getMediaStorage();
  const info = await storage.stat(screenshot.storageKey);
  if (!info) throw new ServiceError("NOT_FOUND", "原始截图文件不存在");
  return { ...screenshot, stream: await storage.open(screenshot.storageKey) };
}
