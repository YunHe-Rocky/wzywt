export const AUTH_USERNAME_MIN_LENGTH = 2;
export const AUTH_USERNAME_MAX_LENGTH = 32;
export const AUTH_PASSWORD_MIN_LENGTH = 11;
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export function normalizeAuthUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  return username.length >= AUTH_USERNAME_MIN_LENGTH && username.length <= AUTH_USERNAME_MAX_LENGTH ? username : null;
}

export function passwordValidationError(value: unknown, minimumLength = AUTH_PASSWORD_MIN_LENGTH): string | null {
  if (typeof value !== "string" || value.length < minimumLength) return `密码至少${minimumLength}位`;
  if (new TextEncoder().encode(value).byteLength > BCRYPT_MAX_PASSWORD_BYTES) return "密码 UTF-8 编码后不能超过72字节";
  return null;
}

export function normalizeSecurityAnswer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const answer = value.trim();
  return answer && new TextEncoder().encode(answer).byteLength <= BCRYPT_MAX_PASSWORD_BYTES ? answer : null;
}

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
  deletedAt?: Date | null;
}

export type AuthState =
  | { ok: true; user: { userId: number; username: string; role: string } }
  | { ok: false; code: "UNAUTHORIZED" | "BANNED" };

export function resolveAuthState(
  session: SessionIdentitySnapshot,
  user: PersistedIdentity | null,
): AuthState {
  if (!session.userId || !user || user.isTemporary || user.deletedAt || session.sessionVersion !== user.sessionVersion) {
    return { ok: false, code: "UNAUTHORIZED" };
  }
  if (user.banned) return { ok: false, code: "BANNED" };
  return { ok: true, user: { userId: user.id, username: user.username, role: user.role } };
}
