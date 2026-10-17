import { Prisma } from "@prisma/client";
import { normalizeHeroPowerScore, ROLES } from "@/core/game";
import { prisma } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";

function userIdFrom(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new ServiceError("VALIDATION_ERROR", "目标用户无效");
  }
  return value;
}

async function managedTransaction(operation: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new ServiceError("CONFLICT", "房间资料已变化，请刷新后重试");
    }
    throw error;
  }
}

export async function manageTournamentAdministrator(tournamentId: number, userId: number, input: { targetUserId?: unknown; action?: unknown }) {
  const targetUserId = userIdFrom(input.targetUserId);
  const { action } = input;
  if (action !== "promote" && action !== "demote") throw new ServiceError("VALIDATION_ERROR", "管理操作参数无效");
  await managedTransaction(async (tx) => {
    const owner = await tx.tournamentAdmin.findUnique({ where: { tournamentId_userId: { tournamentId, userId } }, select: { role: true } });
    if (owner?.role !== "owner") throw new PermissionError();
    const target = await tx.tournamentAdmin.findUnique({ where: { tournamentId_userId: { tournamentId, userId: targetUserId } }, select: { role: true } });
    if (target?.role === "owner") throw new ServiceError("VALIDATION_ERROR", "不能修改房主权限");
    if (action === "promote") {
      const member = await tx.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
        select: { isTemporary: true, isSpectator: true, user: { select: { isTemporary: true, banned: true, deletedAt: true } } },
      });
      if (!member || member.isTemporary || member.isSpectator || member.user.isTemporary || member.user.banned || member.user.deletedAt) {
        throw new ServiceError("VALIDATION_ERROR", "只能将本房间的正式选手设为管理员");
      }
      await tx.tournamentAdmin.upsert({
        where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
        update: { role: "co_owner" },
        create: { tournamentId, userId: targetUserId, role: "co_owner" },
      });
    } else {
      await tx.tournamentAdmin.deleteMany({ where: { tournamentId, userId: targetUserId, role: "co_owner" } });
    }
  });
}

interface TemporaryHeroPower { roleType: string; heroId: number; heroName: string; powerScore: number }

function parseTemporaryHeroPowers(input: unknown): TemporaryHeroPower[] {
  if (!Array.isArray(input) || input.length > 15) throw new ServiceError("VALIDATION_ERROR", "英雄战力必须是最多15项的数组");
  const seen = new Set<string>();
  return input.map((value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ServiceError("VALIDATION_ERROR", "英雄战力格式无效");
    const { roleType, heroId, heroName, powerScore } = value as Record<string, unknown>;
    if (typeof roleType !== "string" || !ROLES.includes(roleType as (typeof ROLES)[number])
      || typeof heroId !== "number" || !Number.isInteger(heroId) || heroId <= 0 || heroId > 2_147_483_647
      || (heroName !== undefined && (typeof heroName !== "string" || heroName.trim().length > 64))
      || typeof powerScore !== "number") throw new ServiceError("VALIDATION_ERROR", "英雄战力参数无效");
    const key = `${roleType}:${heroId}`;
    if (seen.has(key)) throw new ServiceError("VALIDATION_ERROR", "同一分路不能重复填写同一英雄");
    seen.add(key);
    let score: number;
    try { score = normalizeHeroPowerScore(powerScore); }
    catch { throw new ServiceError("VALIDATION_ERROR", "英雄战力必须是 1-999999 的整数"); }
    return { roleType, heroId, heroName: typeof heroName === "string" ? heroName.trim() : "", powerScore: score };
  });
}

export async function addTemporaryPlayerHeroPowers(tournamentId: number, userId: number, input: { targetUserId?: unknown; heroPowers?: unknown }) {
  const targetUserId = userIdFrom(input.targetUserId);
  const powers = parseTemporaryHeroPowers(input.heroPowers);
  await managedTransaction(async (tx) => {
    const admin = await tx.tournamentAdmin.findUnique({ where: { tournamentId_userId: { tournamentId, userId } }, select: { role: true } });
    if (!admin || !["owner", "co_owner"].includes(admin.role)) throw new PermissionError();
    const member = await tx.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      select: { isTemporary: true, user: { select: { isTemporary: true } } },
    });
    if (!member?.isTemporary || !member.user.isTemporary) throw new PermissionError();
    const existing = await tx.heroPower.findMany({ where: { userId: targetUserId }, select: { roleType: true, heroId: true } });
    for (const role of ROLES) {
      if (existing.filter((power) => power.roleType === role).length + powers.filter((power) => power.roleType === role).length > 3) {
        throw new ServiceError("VALIDATION_ERROR", "每个分路最多3个英雄");
      }
    }
    if (powers.some((power) => existing.some((saved) => saved.roleType === power.roleType && saved.heroId === power.heroId))) {
      throw new ServiceError("CONFLICT", "该分路已填写此英雄，请刷新后重试");
    }
    if (powers.length) await tx.heroPower.createMany({ data: powers.map((power) => ({ userId: targetUserId, ...power })) });
  });
}
