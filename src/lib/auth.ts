import bcrypt from "bcryptjs";
import { getSession } from "./session";
import { prisma } from "./db";
import { resolveAuthState } from "@/features/auth/model";

export type AuthErrorCode = "UNAUTHORIZED" | "BANNED";

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
  }
}

export type AuthenticationResult =
  | { ok: true; user: { userId: number; username: string; role: string } }
  | { ok: false; code: AuthErrorCode };

export async function authenticate(): Promise<AuthenticationResult> {
  try {
    return { ok: true, user: await requireAuth() };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, code: error.code };
    throw error;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) {
    throw new AuthError("UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      role: true,
      banned: true,
      isTemporary: true,
      sessionVersion: true,
    },
  });

  const authState = resolveAuthState(session, user);
  if (!authState.ok) {
    session.destroy();
    throw new AuthError(authState.code);
  }

  // role 以数据库实时值为准，不信任 Cookie 中的权限快照。
  // Cookie 中的角色只是快照，权限始终以数据库实时状态为准。
  return authState.user;
}
