import { Prisma } from "@prisma/client";
import {
  isMatchRoleType,
  isMatchSide,
  MATCH_SCREENSHOT_TYPES,
  MATCH_STAT_FIELDS,
  type MatchStatField,
} from "@/features/matches/model";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";
import { requireMatchManager } from "./access";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ServiceError("VALIDATION_ERROR", `${label}格式错误`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new ServiceError("VALIDATION_ERROR", `${label}长度应为 ${min}-${max} 字`);
  return text;
}

function parseInteger(value: unknown, label: string, max = 4_294_967_295): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new ServiceError("VALIDATION_ERROR", `${label}必须是 0-${max} 的整数`);
  }
  return value;
}

function parseDecimal(value: unknown, label: string, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    throw new ServiceError("VALIDATION_ERROR", `${label}必须是 0-${max} 的数值`);
  }
  return value;
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== "string") throw new ServiceError("VALIDATION_ERROR", `${label}格式错误`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ServiceError("VALIDATION_ERROR", `${label}格式错误`);
  return date;
}

interface ParsedStats {
  damageDealt: number;
  damageTaken: number;
  gold: number;
  participationRate: number;
  damageConversionRate: number;
  damageTakenPerDeath: number;
  jungleGold: number;
  minionKills: number;
  kills: number;
  deaths: number;
  assists: number;
  controlScore: number;
  healing: number;
  towerDamage: number;
}

function parseStats(value: unknown): ParsedStats {
  if (!isRecord(value)) throw new ServiceError("VALIDATION_ERROR", "玩家战绩字段不完整");
  return {
    damageDealt: parseInteger(value.damageDealt, "输出伤害"),
    damageTaken: parseInteger(value.damageTaken, "承受伤害"),
    gold: parseInteger(value.gold, "总经济"),
    participationRate: parseDecimal(value.participationRate, "参团率", 1),
    damageConversionRate: parseDecimal(value.damageConversionRate, "伤害转化比", 10),
    damageTakenPerDeath: parseInteger(value.damageTakenPerDeath, "每死承伤"),
    jungleGold: parseInteger(value.jungleGold, "野怪经济"),
    minionKills: parseInteger(value.minionKills, "补刀数"),
    kills: parseInteger(value.kills, "击败", 65_535),
    deaths: parseInteger(value.deaths, "死亡", 65_535),
    assists: parseInteger(value.assists, "助攻", 65_535),
    controlScore: parseDecimal(value.controlScore, "控制效果", 99_999_999),
    healing: parseInteger(value.healing, "治疗量"),
    towerDamage: parseInteger(value.towerDamage, "对塔伤害"),
  };
}

interface ParsedConfirmationPlayer {
  id: number;
  memberId: number | null;
  isGuest: boolean;
  gameNickname: string;
  heroId: number | null;
  heroName: string | null;
  roleType: string;
  score: number;
  stats: ParsedStats;
}

function parseConfirmationPlayers(value: unknown): ParsedConfirmationPlayer[] {
  if (!Array.isArray(value) || value.length !== 10) throw new ServiceError("VALIDATION_ERROR", "必须确认完整 10 名玩家");
  return value.map((item) => {
    if (!isRecord(item)) throw new ServiceError("VALIDATION_ERROR", "玩家确认数据格式错误");
    const id = parseInteger(item.id, "玩家记录 ID", Number.MAX_SAFE_INTEGER);
    if (id <= 0) throw new ServiceError("VALIDATION_ERROR", "玩家记录 ID 无效");
    if (typeof item.isGuest !== "boolean") throw new ServiceError("VALIDATION_ERROR", "补位标记格式错误");
    const memberId = item.memberId === null ? null : parseInteger(item.memberId, "成员 ID", Number.MAX_SAFE_INTEGER);
    if (item.isGuest !== (memberId === null)) throw new ServiceError("VALIDATION_ERROR", "补位玩家不能绑定正式成员");
    const heroId = item.heroId === null || item.heroId === undefined ? null : parseInteger(item.heroId, "英雄 ID", Number.MAX_SAFE_INTEGER);
    const heroName = typeof item.heroName === "string" && item.heroName.trim() ? item.heroName.trim().slice(0, 64) : null;
    if (heroId === null && heroName === null) throw new ServiceError("VALIDATION_ERROR", "每名玩家必须确认英雄");
    if (!isMatchRoleType(item.roleType)) throw new ServiceError("VALIDATION_ERROR", "实际分路无效");
    return {
      id,
      memberId,
      isGuest: item.isGuest,
      gameNickname: parseText(item.gameNickname, "游戏昵称", 1, 32),
      heroId,
      heroName,
      roleType: item.roleType,
      score: parseDecimal(item.score, "评分", 100),
      stats: parseStats(item.stats),
    };
  });
}

export async function confirmMatchPlayers(tournamentId: number, matchId: number, input: unknown) {
  const actor = await requireMatchManager(tournamentId, matchId);
  if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "确认数据格式错误");
  const expectedMatchUpdatedAt = parseDate(input.expectedMatchUpdatedAt, "比赛版本");
  const confirmedPlayers = parseConfirmationPlayers(input.players);
  if (new Set(confirmedPlayers.map(({ id }) => id)).size !== 10) throw new ServiceError("VALIDATION_ERROR", "玩家记录不能重复");
  const memberIds = confirmedPlayers.map(({ memberId }) => memberId).filter((id): id is number => id !== null);
  if (new Set(memberIds).size !== memberIds.length) throw new ServiceError("CONFLICT", "同一正式成员不能在一场比赛绑定两次");
  const match = await prisma.internalMatch.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      updatedAt: true,
      players: { select: { id: true, side: true, slot: true } },
      tournament: {
        select: {
          players: { where: { isSpectator: false, isTemporary: false, user: { isTemporary: false } }, select: { userId: true } },
        },
      },
    },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  if (match.status === "SUBMITTED") throw new ServiceError("CONFLICT", "正式比赛档案不能由上传者修改");
  if (match.updatedAt.getTime() !== expectedMatchUpdatedAt.getTime()) throw new ServiceError("CONFLICT", "比赛数据已变化，请刷新后重试");
  const actualIds = new Set(match.players.map(({ id }) => id));
  if (confirmedPlayers.some(({ id }) => !actualIds.has(id))) throw new ServiceError("VALIDATION_ERROR", "玩家记录不属于该比赛");
  const allowedMembers = new Set(match.tournament.players.map(({ userId }) => userId));
  if (memberIds.some((memberId) => !allowedMembers.has(memberId))) throw new ServiceError("VALIDATION_ERROR", "确认成员不属于本场允许成员范围");
  const heroIds = Array.from(new Set(confirmedPlayers.map(({ heroId }) => heroId).filter((id): id is number => id !== null)));
  const heroes = heroIds.length ? await prisma.hero.findMany({ where: { heroId: { in: heroIds } }, select: { heroId: true, name: true } }) : [];
  const heroNames = new Map(heroes.map(({ heroId, name }) => [heroId, name]));
  if (heroNames.size !== heroIds.length) throw new ServiceError("VALIDATION_ERROR", "存在无效英雄 ID");

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.internalMatch.findUnique({ where: { id: matchId }, select: { status: true, updatedAt: true } });
    if (!fresh || fresh.status === "SUBMITTED" || fresh.updatedAt.getTime() !== expectedMatchUpdatedAt.getTime()) {
      throw new ServiceError("CONFLICT", "比赛数据已变化，请刷新后重试");
    }
    const confirmedAt = new Date();
    for (const player of confirmedPlayers) {
      await tx.matchPlayer.update({
        where: { id: player.id },
        data: {
          memberId: player.memberId,
          isGuest: player.isGuest,
          gameNickname: player.gameNickname,
          heroId: player.heroId,
          heroName: player.heroId ? heroNames.get(player.heroId) as string : player.heroName,
          roleType: player.roleType,
          score: player.score,
          identityConfirmedAt: confirmedAt,
          identityConfirmedById: actor.userId,
        },
      });
      await tx.matchPlayerStat.upsert({
        where: { matchPlayerId: player.id },
        create: { matchPlayerId: player.id, ...player.stats, confirmedAt, confirmedById: actor.userId },
        update: { ...player.stats, confirmedAt, confirmedById: actor.userId },
      });
    }
    await tx.internalMatch.update({ where: { id: matchId }, data: { status: "CONFIRMED" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, status: "CONFIRMED" };
}

export async function submitMatch(tournamentId: number, matchId: number, input: unknown) {
  const actor = await requireMatchManager(tournamentId, matchId);
  if (!isRecord(input) || !isMatchSide(input.winnerSide)) throw new ServiceError("VALIDATION_ERROR", "胜方无效");
  const winnerSide = input.winnerSide;
  const redTotalKills = parseInteger(input.redTotalKills, "红方总击杀", 65_535);
  const blueTotalKills = parseInteger(input.blueTotalKills, "蓝方总击杀", 65_535);
  const playedAt = input.playedAt === undefined ? undefined : parseDate(input.playedAt, "比赛时间");
  try {
    return await prisma.$transaction(async (tx) => {
      const match = await tx.internalMatch.findFirst({
        where: { id: matchId, tournamentId },
        include: {
          screenshots: { select: { type: true } },
          recognitions: { where: { status: "COMPLETED" }, select: { id: true }, take: 1 },
          players: { include: { stats: true } },
        },
      });
      if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
      if (match.status === "SUBMITTED") throw new ServiceError("CONFLICT", "比赛战绩已经正式提交");
      if (match.status !== "CONFIRMED") throw new ServiceError("BUSINESS_VALIDATION_FAILED", "必须先完成十名玩家与数据确认");
      const screenshotTypes = new Set(match.screenshots.map(({ type }) => type));
      if (MATCH_SCREENSHOT_TYPES.some((type) => !screenshotTypes.has(type))) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "六类原始截图不完整");
      if (match.recognitions.length === 0) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "尚无已完成的识别记录");
      if (match.consistencyStatus === "FAIL" || match.consistencyStatus === "PENDING") throw new ServiceError("BUSINESS_VALIDATION_FAILED", "同场一致性校验未通过");
      const red = match.players.filter(({ side }) => side === "red");
      const blue = match.players.filter(({ side }) => side === "blue");
      if (match.players.length !== 10 || red.length !== 5 || blue.length !== 5) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "必须是红蓝各 5 人");
      if (match.players.some((player) => !player.identityConfirmedAt || !player.stats?.confirmedAt || player.score === null || (!player.heroId && !player.heroName))) {
        throw new ServiceError("BUSINESS_VALIDATION_FAILED", "存在未确认的玩家、英雄、评分或战绩字段");
      }
      const formalIds = match.players.map(({ memberId }) => memberId).filter((id): id is number => id !== null);
      if (new Set(formalIds).size !== formalIds.length) throw new ServiceError("CONFLICT", "同一正式成员被重复绑定");
      const sumRedKills = red.reduce((sum, player) => sum + (player.stats?.kills ?? 0), 0);
      const sumBlueKills = blue.reduce((sum, player) => sum + (player.stats?.kills ?? 0), 0);
      if (sumRedKills !== redTotalKills || sumBlueKills !== blueTotalKills) {
        throw new ServiceError("BUSINESS_VALIDATION_FAILED", "双方总击杀与十名玩家 K 数据不一致", { sumRedKills, sumBlueKills });
      }
      const updated = await tx.internalMatch.updateMany({
        where: { id: matchId, status: "CONFIRMED" },
        data: { status: "SUBMITTED", winnerSide, redTotalKills, blueTotalKills, playedAt, submittedAt: new Date(), submittedById: actor.userId },
      });
      if (updated.count !== 1) throw new ServiceError("CONFLICT", "比赛数据已变化，请刷新后重试");
      await tx.matchPlayer.updateMany({ where: { matchId, side: winnerSide }, data: { isWinner: true } });
      await tx.matchPlayer.updateMany({ where: { matchId, side: { not: winnerSide } }, data: { isWinner: false } });
      await tx.adminOperation.create({
        data: {
          tournamentId,
          matchId,
          adminId: actor.userId,
          action: "submit_match",
          details: { winnerSide, redTotalKills, blueTotalKills, playerCount: 10 },
        },
      });
      return { ok: true, status: "SUBMITTED" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ServiceError("CONFLICT", "并发提交冲突，请刷新后重试");
    throw error;
  }
}

const DISPUTABLE_FIELDS = new Set<string>(["score", "gameNickname", "heroName", "roleType", ...MATCH_STAT_FIELDS]);

function jsonColumnValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "object" && "toString" in value) return String(value);
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function auditScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object" && "toString" in value) return String(value);
  return JSON.stringify(value);
}

export async function createMatchDispute(tournamentId: number, matchId: number, input: unknown) {
  const user = await requireAuth();
  if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "异议数据格式错误");
  const message = parseText(input.message, "问题描述", 5, 1000);
  const matchPlayerId = input.matchPlayerId === null || input.matchPlayerId === undefined ? null : parseInteger(input.matchPlayerId, "玩家记录 ID", Number.MAX_SAFE_INTEGER);
  const field = input.field === null || input.field === undefined ? null : parseText(input.field, "字段", 1, 64);
  if (field && !DISPUTABLE_FIELDS.has(field)) throw new ServiceError("VALIDATION_ERROR", "异议字段无效");
  const match = await prisma.internalMatch.findFirst({
    where: { id: matchId, tournamentId },
    select: { status: true, players: { where: matchPlayerId ? { id: matchPlayerId } : undefined, include: { stats: true } } },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  if (match.status !== "SUBMITTED") throw new ServiceError("BUSINESS_VALIDATION_FAILED", "只能对正式比赛档案提出异议");
  if (matchPlayerId && match.players.length !== 1) throw new ServiceError("VALIDATION_ERROR", "玩家记录不属于该比赛");
  const recentCount = await prisma.matchDispute.count({
    where: { createdById: user.userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recentCount >= 5) throw new ServiceError("TOO_MANY_REQUESTS", "异议提交过于频繁，请稍后再试");
  const player = match.players[0];
  const current = player && field
    ? (field in (player.stats ?? {}) ? (player.stats as unknown as Record<string, unknown>)[field] : (player as unknown as Record<string, unknown>)[field])
    : null;
  return prisma.matchDispute.create({
    data: { matchId, matchPlayerId, field, currentValue: jsonColumnValue(current), message, createdById: user.userId },
    select: { id: true, status: true, createdAt: true },
  });
}

function parseCorrectionValue(field: string, value: unknown): string | number {
  if (field === "gameNickname") return parseText(value, "游戏昵称", 1, 32);
  if (field === "heroName") return parseText(value, "英雄名称", 1, 64);
  if (field === "roleType") {
    if (!isMatchRoleType(value)) throw new ServiceError("VALIDATION_ERROR", "实际分路无效");
    return value;
  }
  if (field === "score") return parseDecimal(value, "评分", 100);
  if (["participationRate"].includes(field)) return parseDecimal(value, "参团率", 1);
  if (["damageConversionRate"].includes(field)) return parseDecimal(value, "伤害转化比", 10);
  if (["controlScore"].includes(field)) return parseDecimal(value, "控制效果", 99_999_999);
  if (["kills", "deaths", "assists"].includes(field)) return parseInteger(value, field, 65_535);
  return parseInteger(value, field);
}

export async function correctMatchRecord(matchId: number, input: unknown) {
  const user = await requireAuth();
  if (user.role !== "admin") throw new PermissionError();
  if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "纠错数据格式错误");
  const matchPlayerId = parseInteger(input.matchPlayerId, "玩家记录 ID", Number.MAX_SAFE_INTEGER);
  const field = parseText(input.field, "字段", 1, 64);
  if (!DISPUTABLE_FIELDS.has(field)) throw new ServiceError("VALIDATION_ERROR", "纠错字段无效");
  const value = parseCorrectionValue(field, input.value);
  const reason = parseText(input.reason, "修改原因", 5, 500);
  const expectedUpdatedAt = parseDate(input.expectedUpdatedAt, "记录版本");
  const disputeId = input.disputeId === null || input.disputeId === undefined ? null : parseInteger(input.disputeId, "异议 ID", Number.MAX_SAFE_INTEGER);
  return prisma.$transaction(async (tx) => {
    const player = await tx.matchPlayer.findFirst({
      where: { id: matchPlayerId, matchId },
      include: { stats: true, match: { select: { tournamentId: true, status: true } } },
    });
    if (!player) throw new ServiceError("NOT_FOUND", "比赛玩家不存在");
    if (player.match.status !== "SUBMITTED") throw new ServiceError("BUSINESS_VALIDATION_FAILED", "只能纠正正式比赛档案");
    const isStat = MATCH_STAT_FIELDS.includes(field as MatchStatField);
    const version = isStat ? player.stats?.updatedAt : player.updatedAt;
    if (!version || version.getTime() !== expectedUpdatedAt.getTime()) throw new ServiceError("CONFLICT", "记录已被其他管理员修改，请刷新后重试");
    let oldValue: unknown;
    if (isStat) {
      if (!player.stats) throw new ServiceError("NOT_FOUND", "玩家战绩不存在");
      oldValue = (player.stats as unknown as Record<string, unknown>)[field];
      const updated = await tx.matchPlayerStat.updateMany({
        where: { id: player.stats.id, updatedAt: expectedUpdatedAt },
        data: { [field]: value },
      });
      if (updated.count !== 1) throw new ServiceError("CONFLICT", "记录已被其他管理员修改，请刷新后重试");
    } else {
      oldValue = (player as unknown as Record<string, unknown>)[field];
      const updated = await tx.matchPlayer.updateMany({
        where: { id: player.id, updatedAt: expectedUpdatedAt },
        data: { [field]: value },
      });
      if (updated.count !== 1) throw new ServiceError("CONFLICT", "记录已被其他管理员修改，请刷新后重试");
    }
    if (disputeId) {
      const dispute = await tx.matchDispute.findFirst({ where: { id: disputeId, matchId } });
      if (!dispute) throw new ServiceError("VALIDATION_ERROR", "异议单不属于该比赛");
      await tx.matchDispute.update({
        where: { id: disputeId },
        data: { status: "resolved", handledById: user.userId, handledAt: new Date(), resolution: reason },
      });
    }
    await tx.adminOperation.create({
      data: {
        tournamentId: player.match.tournamentId,
        matchId,
        adminId: user.userId,
        action: "correct_match",
        targetId: player.id,
        details: { field, oldValue: auditScalar(oldValue), newValue: value, reason, disputeId },
      },
    });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
