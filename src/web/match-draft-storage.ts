export const MATCH_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface MatchDraftIdentity {
  userId: number;
  matchId: string;
  evidenceRevision: number;
  baseUpdatedAt: string;
}

export interface MatchDraftState<T> {
  players: T[];
  winnerSide: "red" | "blue";
  savedAt: number;
}

interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredDraft<T> extends MatchDraftIdentity, MatchDraftState<T> {
  version: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function matchDraftKey(userId: number, matchId: string): string {
  return `wzywt:match-draft:v1:${userId}:${matchId}`;
}

export function matchDraftVersion(identity: Pick<MatchDraftIdentity, "evidenceRevision" | "baseUpdatedAt">): string {
  return `${identity.evidenceRevision}:${identity.baseUpdatedAt}`;
}

export function shouldPreserveActiveMatchDraft(dirty: boolean, activeVersion: string | null, identity: MatchDraftIdentity): boolean {
  return dirty && activeVersion === matchDraftVersion(identity);
}

export function writeMatchDraft<T>(storage: DraftStorage, identity: MatchDraftIdentity, state: Omit<MatchDraftState<T>, "savedAt">, now = Date.now()): void {
  const payload: StoredDraft<T> = { version: 1, ...identity, ...state, savedAt: now };
  storage.setItem(matchDraftKey(identity.userId, identity.matchId), JSON.stringify(payload));
}

export function clearMatchDraft(storage: DraftStorage, identity: Pick<MatchDraftIdentity, "userId" | "matchId">): void {
  storage.removeItem(matchDraftKey(identity.userId, identity.matchId));
}

export function readMatchDraft<T>(
  storage: DraftStorage,
  identity: MatchDraftIdentity,
  isPlayer: (value: unknown) => value is T,
  now = Date.now(),
): MatchDraftState<T> | null {
  const key = matchDraftKey(identity.userId, identity.matchId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.userId !== identity.userId || value.matchId !== identity.matchId
      || value.evidenceRevision !== identity.evidenceRevision || value.baseUpdatedAt !== identity.baseUpdatedAt
      || typeof value.savedAt !== "number" || !Number.isSafeInteger(value.savedAt)
      || value.savedAt > now + 60_000 || now - value.savedAt > MATCH_DRAFT_TTL_MS
      || (value.winnerSide !== "red" && value.winnerSide !== "blue")
      || !Array.isArray(value.players) || !value.players.every(isPlayer)) {
      storage.removeItem(key);
      return null;
    }
    return { players: value.players, winnerSide: value.winnerSide, savedAt: value.savedAt };
  } catch {
    storage.removeItem(key);
    return null;
  }
}