import { serializable } from "@/lib/serializable";
import { ServiceError } from "@/lib/service-error";
import { reconcileOrDeleteTournament } from "./lifecycle";

export async function leaveTournament(tournamentId: number, userId: number) {
  return serializable(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new ServiceError("NOT_FOUND", "赛事不存在");
    if (!["recruiting", "locked"].includes(tournament.status) || tournament.splitResult !== null || tournament.deadline.getTime() <= Date.now()) throw new ServiceError("CONFLICT", "赛事已截止或已完成分队，不能退出");
    const owner = await tx.tournamentAdmin.findFirst({ where: { tournamentId, userId, role: "owner" } });
    if (owner) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "房主不能退出，请取消赛事");
    const deleted = await tx.tournamentPlayer.deleteMany({ where: { tournamentId, userId } });
    if (deleted.count !== 1) throw new ServiceError("NOT_FOUND", "你不在该房间中");
    await reconcileOrDeleteTournament(tx, tournamentId);
  });
}
