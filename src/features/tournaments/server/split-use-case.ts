import { runTeamSplit, SplitExecutionError } from "@/features/tournaments/server/team-balancing-pool";
import { commitTournamentSplit, SplitConflictError } from "@/features/tournaments/server/split";
import { prisma } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";

export async function executeTournamentSplit(tournamentId: number, userId: number) {
  const admin = await prisma.tournamentAdmin.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { role: true },
  });
  if (!admin) throw new PermissionError();
  if (admin.role === "co_owner") {
    const recentOwnerSplit = await prisma.adminOperation.findFirst({
      where: {
        tournamentId,
        action: "split",
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        admin: { tournamentAdmins: { some: { tournamentId, role: "owner" } } },
      },
      select: { id: true },
    });
    if (recentOwnerSplit) throw new ServiceError("CONFLICT", "房主5分钟内执行过此操作，请稍后再试");
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { deadline: true, status: true, splitResult: true },
  });
  if (!tournament) throw new ServiceError("NOT_FOUND", "赛事不存在");
  if (tournament.status === "completed" || tournament.splitResult !== null) {
    throw new ServiceError("CONFLICT", "赛事已经完成分队");
  }
  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId, isSpectator: false },
    include: { user: { include: { rolePreferences: true, heroPowers: true } } },
    orderBy: { userId: "asc" },
  });
  if (players.length !== 10) throw new ServiceError("VALIDATION_ERROR", `需要正好10人才能分队，当前${players.length}人`);
  const algorithmInput = players.map((player) => {
    const heroPowers: Record<string, number[]> = {};
    for (const power of player.user.heroPowers) (heroPowers[power.roleType] ??= []).push(power.powerScore);
    return { userId: player.userId, rolePreferences: player.user.rolePreferences, heroPowers };
  });
  let result;
  try {
    result = await runTeamSplit(algorithmInput);
  } catch (error) {
    if (!(error instanceof SplitExecutionError)) throw error;
    if (error.code === "SPLIT_TIMEOUT") throw new ServiceError("GATEWAY_TIMEOUT", "分队计算超时，请重试");
    throw new ServiceError("SERVICE_UNAVAILABLE", error.code === "SPLIT_BUSY" ? "分队任务较多，请稍后重试" : "分队计算暂时不可用，请稍后重试", { retryAfterSeconds: 2 });
  }
  if (!result) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "分队输入无效");
  const usernameById = new Map(players.map((player) => [player.userId, player.user.username]));
  const assignments = [...result.teamRed, ...result.teamBlue].map((member) => ({
    userId: member.userId,
    username: usernameById.get(member.userId) ?? "未知玩家",
    assignedRole: member.assignedRole,
    preferenceRank: member.preferenceRank,
    reason: member.preferenceRank <= 5 ? `分配到第 ${member.preferenceRank} 志愿` : "未填写该分路偏好，按全局最优补位",
  }));
  const unknownStrengthCount = 10 - result.strengthCoverage;
  const splitData = {
    ...result,
    playerDetails: players.map((player) => ({ userId: player.userId, username: player.user.username })),
    explanation: {
      algorithmVersion: "team-balancing-v2-preference-first",
      policy: "先逐级最大化第一至第五志愿满足人数；偏好相同时，再比较双方总强度、分路强度、段位差与确定性签名。",
      caveat: "强度是依据当前分路资料计算的相对估计，不是经过校准的胜率预测。",
      unknownStrengthCount,
      unknownStrengthRatio: unknownStrengthCount / 10,
      assignments,
    },
  };
  try {
    await commitTournamentSplit({ tournamentId, adminId: userId, expectedPlayerIds: players.map(({ userId: id }) => id), splitData });
  } catch (error) {
    if (error instanceof SplitConflictError) throw new ServiceError("CONFLICT", "赛事状态已变化，请刷新后重试");
    throw error;
  }
  return { ...splitData, isBeforeDeadline: tournament.deadline > new Date() };
}