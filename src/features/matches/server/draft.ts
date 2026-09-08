import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { MATCH_SCREENSHOT_TYPES, parseSplitSnapshot, type MatchScreenshotType } from "@/features/matches/model";
import { getMatchVisibility } from "@/features/matches/visibility";
import { attachMediaReservation, consumeMediaReservation, releaseMediaReservation, reserveMediaUpload } from "@/features/media/server/quota";
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
        tacticRooms: { create: ["red", "blue"].map((side) => ({
          side,
          layers: { create: { name: "基础图层", sortOrder: 0, createdById: actor.userId } },
        })) },
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
    select: { admins: { where: { userId: user.userId }, select: { role: true } } },
  });
  if (!tournament) throw new ServiceError("NOT_FOUND", "赛事不存在");
  const privileged = user.role === "admin" || tournament.admins.some(({ role }) => role === "owner" || role === "co_owner");
  const matches = await prisma.internalMatch.findMany({
    where: {
      tournamentId,
      ...(privileged ? {} : { players: { some: { memberId: user.userId } } }),
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
      players: { where: { memberId: user.userId }, select: { memberId: true, side: true } },
      _count: { select: { screenshots: true, players: true, combatPosts: true } },
    },
  });
  return matches.map(({ players, ...match }) => {
    const { ownSide, canViewArchive } = getMatchVisibility(user, { ...match, players, tournament });
    if (!canViewArchive) {
      return { id: match.id, playedAt: match.playedAt, status: match.status, ownSide, canViewArchive,
        winnerSide: null, redTotalKills: null, blueTotalKills: null, consistencyStatus: "PENDING",
        submittedAt: null, _count: { screenshots: 0, players: 0, combatPosts: 0 } };
    }
    return { ...match, ownSide, canViewArchive };
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
      screenshots: { orderBy: { type: "asc" }, select: { id: true, type: true, originalFilename: true, mimeType: true, size: true, sha256: true, revision: true, recognitionStatus: true, createdAt: true } },
      recognitions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, engine: true, evidenceRevision: true, normalizedResult: true, warnings: true, errorCode: true, attemptCount: true, availableAt: true, heartbeatAt: true, createdAt: true, finishedAt: true } },
      disputes: { where: { createdById: user.userId }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  const { canManage, ownSide, canViewArchive } = getMatchVisibility(user, match);
  if (!canViewArchive) throw new PermissionError();
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
      consistencyDetails: canManage ? match.consistencyDetails : null,
      evidenceRevision: match.evidenceRevision,
      recordRevision: match.recordRevision,
      submittedAt: match.submittedAt,
      updatedAt: match.updatedAt,
      players: match.players.filter((player) => canManage || player.side === ownSide).map((player) => ({
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
      screenshots: canManage ? match.screenshots : [],
      recognition: canManage ? match.recognitions[0] ?? null : null,
      disputes: canManage ? match.disputes : match.disputes
        .filter((dispute) => dispute.matchPlayerId === null || match.players.some((player) => player.id === dispute.matchPlayerId && player.side === ownSide))
        .map((dispute) => dispute.matchPlayerId === null ? { ...dispute, currentValue: null } : dispute),
    },
    access: { canManage, ownSide, isSuperAdmin: user.role === "admin", currentUserId: user.userId },
    eligibleMembers: canManage ? match.tournament.players.map(({ userId, user: member }) => ({
      id: userId,
      username: member.username,
      gameNickname: member.gameNickname,
    })) : [],
  };
}

export interface MatchScreenshotUploadAuthorization {
  tournamentId: number;
  matchId: number;
  actorUserId: number;
  expectedEvidenceRevision: number;
}

export async function authorizeMatchScreenshotUpload(
  tournamentId: number,
  matchId: number,
): Promise<MatchScreenshotUploadAuthorization> {
  const actor = await requireMatchManager(tournamentId, matchId);
  const match = await prisma.internalMatch.findFirst({
    where: { id: matchId, tournamentId },
    select: { status: true, evidenceRevision: true },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  if (!["DRAFT", "UPLOADED", "WAITING_CONFIRMATION"].includes(match.status)) {
    throw new ServiceError("CONFLICT", "已确认或正式提交的比赛档案不能替换原始截图");
  }
  return { tournamentId, matchId, actorUserId: actor.userId, expectedEvidenceRevision: match.evidenceRevision };
}

export async function uploadMatchScreenshot(
  authorization: MatchScreenshotUploadAuthorization,
  type: MatchScreenshotType,
  file: File,
) {
  const { tournamentId, matchId, actorUserId, expectedEvidenceRevision } = authorization;
  const media = await validateScreenshotFile(file);
  const storage = getMediaStorage();
  const reservation = await reserveMediaUpload(actorUserId, "match-screenshot", media.data.byteLength);
  let stored: { key: string; size: number } | null = null;
  try {
    stored = await storage.save({ namespace: "match-screenshots", extension: media.extension, data: media.data });
    const saved = stored;
    await attachMediaReservation(reservation.id, actorUserId, saved.key, saved.size);
    const sha256 = createHash("sha256").update(media.data).digest("hex");
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.internalMatch.updateMany({
        where: {
          id: matchId,
          tournamentId,
          evidenceRevision: expectedEvidenceRevision,
          status: { in: ["DRAFT", "UPLOADED", "WAITING_CONFIRMATION"] },
        },
        data: {
          evidenceRevision: { increment: 1 },
          activeRecognitionId: null,
          consistencyStatus: "PENDING",
          consistencyDetails: Prisma.DbNull,
        },
      });
      if (claimed.count !== 1) throw new ServiceError("CONFLICT", "截图或比赛状态已变化，请刷新后重试");
      const previous = await tx.matchScreenshot.findUnique({
        where: { matchId_type: { matchId, type } },
        select: { storageKey: true },
      });
      const screenshot = await tx.matchScreenshot.upsert({
        where: { matchId_type: { matchId, type } },
        create: {
          matchId,
          type,
          storageKey: saved.key,
          originalFilename: media.originalFilename,
          mimeType: media.mimeType,
          size: saved.size,
          sha256,
          uploadedById: actorUserId,
          recognitionStatus: "PENDING",
        },
        update: {
          storageKey: saved.key,
          originalFilename: media.originalFilename,
          mimeType: media.mimeType,
          size: saved.size,
          sha256,
          uploadedById: actorUserId,
          revision: { increment: 1 },
          recognitionStatus: "PENDING",
          recognitionPayload: Prisma.DbNull,
        },
        select: { id: true, type: true, originalFilename: true, mimeType: true, size: true, sha256: true, revision: true, recognitionStatus: true, createdAt: true },
      });
      await tx.matchRecognition.updateMany({
        where: { matchId, status: { in: ["QUEUED", "RUNNING"] } },
        data: { status: "SUPERSEDED", errorCode: "EVIDENCE_REPLACED", heartbeatAt: null, finishedAt: new Date() },
      });
      await tx.matchScreenshot.updateMany({
        where: { matchId },
        data: { recognitionStatus: "PENDING", recognitionPayload: Prisma.DbNull },
      });
      const count = await tx.matchScreenshot.count({ where: { matchId } });
      await tx.internalMatch.update({
        where: { id: matchId },
        data: { status: count === MATCH_SCREENSHOT_TYPES.length ? "UPLOADED" : "DRAFT" },
      });
      await consumeMediaReservation(tx, reservation.id, actorUserId, saved.key, saved.size);
      return { screenshot, previousStorageKey: previous?.storageKey ?? null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.previousStorageKey && result.previousStorageKey !== saved.key) {
      await deleteOrQueueMedia(storage, result.previousStorageKey, "screenshot-replaced");
    }
    return result.screenshot;
  } catch (error) {
    await releaseMediaReservation(reservation.id, actorUserId).catch(() => undefined);
    if (stored) await deleteOrQueueMedia(storage, stored.key, "screenshot-database-failure");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new ServiceError("CONFLICT", "并发截图上传冲突，请刷新后重试");
    }
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
