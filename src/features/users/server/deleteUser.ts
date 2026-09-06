import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { reconcileOrDeleteTournament } from "@/features/tournaments/server/lifecycle";

async function hasHistoricalReferences(tx: Prisma.TransactionClient, userId: number): Promise<boolean> {
  const counts = await Promise.all([
    tx.adminOperation.count({ where: { adminId: userId } }),
    tx.internalMatch.count({ where: { OR: [{ createdById: userId }, { submittedById: userId }] } }),
    tx.matchPlayer.count({ where: { OR: [{ memberId: userId }, { identityConfirmedById: userId }] } }),
    tx.matchPlayerStat.count({ where: { confirmedById: userId } }),
    tx.matchScreenshot.count({ where: { uploadedById: userId } }),
    tx.matchRecognition.count({ where: { startedById: userId } }),
    tx.matchDispute.count({ where: { OR: [{ createdById: userId }, { handledById: userId }] } }),
    tx.combatPost.count({ where: { OR: [{ authorId: userId }, { moderatedById: userId }] } }),
    tx.combatPostLike.count({ where: { userId } }),
    tx.combatPostComment.count({ where: { OR: [{ authorId: userId }, { moderatedById: userId }] } }),
    tx.tacticLayer.count({ where: { createdById: userId } }),
    tx.tacticRoute.count({ where: { ownerMemberId: userId } }),
    tx.tacticMarker.count({ where: { ownerMemberId: userId } }),
  ]);
  return counts.some((count) => count > 0);
}

async function removeMutableAccountData(tx: Prisma.TransactionClient, userId: number) {
  const memberships = await tx.tournamentPlayer.findMany({ where: { userId }, select: { tournamentId: true } });
  await tx.passwordResetToken.deleteMany({ where: { userId } });
  await tx.tournamentPlayer.deleteMany({ where: { userId } });
  await tx.tournamentAdmin.deleteMany({ where: { userId } });
  await tx.tournamentPick.deleteMany({ where: { userId } });
  await tx.tempPlayerApplication.deleteMany({ where: { applicantId: userId } });
  await tx.rolePreference.deleteMany({ where: { userId } });
  await tx.heroPower.deleteMany({ where: { userId } });
  for (const tournamentId of new Set(memberships.map(({ tournamentId }) => tournamentId))) {
    await reconcileOrDeleteTournament(tx, tournamentId);
  }
}

export async function deleteUserAndOwnedTournamentsInTransaction(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<{ mode: "deleted" | "anonymized" }> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } });
  if (!user) throw new ServiceError("NOT_FOUND", "用户不存在");
  if (user.deletedAt) return { mode: "anonymized" };
  if (user.role === "admin") throw new ServiceError("BUSINESS_VALIDATION_FAILED", "管理员账户不能从个人入口注销，请先由另一管理员完成权限交接");
  const ownedCount = await tx.tournamentAdmin.count({ where: { userId, role: "owner" } });
  if (ownedCount > 0) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "请先转交或主动删除自己创建的房间，再注销账户");

  const preserveHistory = await hasHistoricalReferences(tx, userId);
  await removeMutableAccountData(tx, userId);
  if (!preserveHistory) {
    await tx.adminOperation.deleteMany({ where: { adminId: userId } });
    await tx.user.delete({ where: { id: userId } });
    return { mode: "deleted" };
  }

  const suffix = randomBytes(5).toString("hex");
  await tx.user.update({
    where: { id: userId },
    data: {
      username: `deleted-${userId}-${suffix}`,
      passwordHash: `deleted:${randomBytes(32).toString("hex")}`,
      securityQuestion: null,
      securityAnswerHash: null,
      role: "user",
      avatar: null,
      gameNickname: "已注销用户",
      gameId: null,
      isTemporary: true,
      banned: true,
      deletedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });
  return { mode: "anonymized" };
}

export async function deleteUserAndOwnedTournaments(userId: number): Promise<{ mode: "deleted" | "anonymized" }> {
  return prisma.$transaction((tx) => deleteUserAndOwnedTournamentsInTransaction(tx, userId), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
