export interface SessionIdentitySnapshot {
  userId?: number;
  sessionVersion?: number;
}

export interface PersistedIdentity {
  id: number;
  username: string;
  role: string;
  banned: boolean;
  isTemporary: boolean;
  sessionVersion: number;
}

export type AuthState =
  | { ok: true; user: { userId: number; username: string; role: string } }
  | { ok: false; code: "UNAUTHORIZED" | "BANNED" };

export function resolveAuthState(
  session: SessionIdentitySnapshot,
  user: PersistedIdentity | null,
): AuthState {
  if (!session.userId || !user || user.isTemporary || session.sessionVersion !== user.sessionVersion) {
    return { ok: false, code: "UNAUTHORIZED" };
  }
  if (user.banned) return { ok: false, code: "BANNED" };
  return { ok: true, user: { userId: user.id, username: user.username, role: user.role } };
}
