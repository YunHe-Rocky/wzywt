import { requireAuth } from "./auth";
import { prisma } from "./db";

export async function requireSuperAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireTournamentAdmin(tournamentId: number) {
  const user = await requireAuth();
  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: user.userId },
  });
  if (!admin) throw new Error("FORBIDDEN");
  return user;
}
