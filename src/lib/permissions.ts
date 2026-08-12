import { AuthError, requireAuth } from "./auth";
import { prisma } from "./db";

export class PermissionError extends Error {
  constructor() {
    super("FORBIDDEN");
    this.name = "PermissionError";
  }
}

export type AuthorizationResult =
  | { ok: true; user: { userId: number; username: string; role: string } }
  | { ok: false; code: "UNAUTHORIZED" | "BANNED" | "FORBIDDEN" };

export async function authorizeSuperAdmin(): Promise<AuthorizationResult> {
  try {
    return { ok: true, user: await requireSuperAdmin() };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, code: error.code };
    if (error instanceof PermissionError) return { ok: false, code: "FORBIDDEN" };
    throw error;
  }
}

export async function requireSuperAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") {
    throw new PermissionError();
  }
  return user;
}

export async function requireTournamentAdmin(tournamentId: number) {
  const user = await requireAuth();
  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: user.userId },
  });
  if (!admin) throw new PermissionError();
  return user;
}
