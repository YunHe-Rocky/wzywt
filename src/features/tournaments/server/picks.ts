import { serializable } from "@/lib/serializable";
import { parseSplitSnapshot } from "@/features/matches/model";
import { ROLES } from "@/core/game";
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

export async function saveTournamentPick(tournamentId: number, userId: number, input: Record<string, unknown>) {
  const { heroId, equipIds, team, roleType, targetUserId } = input;
  const id = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
  if (heroId !== undefined && !id(heroId)) throw new ServiceError("VALIDATION_ERROR", "英雄参数无效");
  if (targetUserId !== undefined && !id(targetUserId)) throw new ServiceError("VALIDATION_ERROR", "目标成员无效");
  if (team !== undefined && team !== "red" && team !== "blue") throw new ServiceError("VALIDATION_ERROR", "队伍参数无效");
  if (roleType !== undefined && (typeof roleType !== "string" || (roleType !== "" && !ROLES.some(role => role === roleType)))) throw new ServiceError("VALIDATION_ERROR", "分路无效");
  if (equipIds !== undefined && (!Array.isArray(equipIds) || equipIds.length > 6 || equipIds.some(value => !id(value)))) throw new ServiceError("VALIDATION_ERROR", "装备最多 6 件且必须为有效 ID");
  return serializable(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, select: {
      splitResult: true, status: true, admins: { where: { userId }, select: { id: true } },
      players: { where: { isSpectator: false }, select: { userId: true, isTemporary: true } },
      matches: { select: { status: true } },
    } });
    if (!tournament) throw new ServiceError("NOT_FOUND", "赛事不存在");
    const admin = tournament.admins.length > 0;
    if (!admin && !tournament.players.some(p => p.userId === userId && !p.isTemporary)) throw new PermissionError();
    if (!admin && targetUserId !== undefined && targetUserId !== userId) throw new PermissionError();
    const target = admin && typeof targetUserId === "number" ? targetUserId : userId;
    if (!tournament.players.some(p => p.userId === target)) throw new ServiceError("VALIDATION_ERROR", "目标必须是当前房间的正式参赛成员");
    if (tournament.status === "finished" || tournament.matches.some(match => match.status === "SUBMITTED")) throw new ServiceError("CONFLICT", "比赛已提交，选人只读");
    if (typeof heroId === "number" && !await tx.hero.findUnique({ where: { heroId }, select: { id: true } })) throw new ServiceError("VALIDATION_ERROR", "英雄不存在");
    if (Array.isArray(equipIds)) {
      const distinct = [...new Set(equipIds as number[])];
      if (await tx.equipment.count({ where: { itemId: { in: distinct } } }) !== distinct.length) throw new ServiceError("VALIDATION_ERROR", "装备不存在");
    }
    const split = parseSplitSnapshot(tournament.splitResult);
    const assigned = split?.find(slot => slot.userId === target);
    if (split && (!assigned || (team !== undefined && assigned.side !== team) || (roleType !== undefined && assigned.roleType !== roleType))) throw new ServiceError("CONFLICT", "队伍和分路必须与正式分队一致");
    const where = { tournamentId_userId: { tournamentId, userId: target } };
    const existing = await tx.tournamentPick.findUnique({ where });
    if (!existing && typeof heroId !== "number") throw new ServiceError("VALIDATION_ERROR", "请先选择英雄");
    const data = { team: assigned?.side ?? (typeof team === "string" ? team : existing?.team || "red"),
      roleType: assigned?.roleType ?? (typeof roleType === "string" ? roleType : existing?.roleType || ""),
      heroId: typeof heroId === "number" ? heroId : existing!.heroId,
      equipJson: Array.isArray(equipIds) ? equipIds as number[] : existing?.equipJson ?? [] };
    return tx.tournamentPick.upsert({ where, create: { tournamentId, userId: target, ...data }, update: data });
  });
}
