export interface GameProfile {
  gameNickname: string | null;
  gameId: string | null;
}

export const PEAK_TOURNAMENT_MIN_RANK = 7;
export const PEAK_TOURNAMENT_MIN_SCORE = 1200;

export interface RolePreferenceSettings {
  roleType: string;
  preferenceRank: number;
  roleRank: number;
  peakScore: number;
  peakRank: number;
}

const GAME_NICKNAME_MAX = 32;
const GAME_ID_MAX = 64;

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") throw new TypeError("资料字段必须是字符串");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new RangeError("资料字段超过长度限制");
  return normalized || null;
}

export function normalizeGameProfile(input: {
  gameNickname: unknown;
  gameId: unknown;
}): GameProfile {
  return {
    gameNickname: normalizeOptionalText(input.gameNickname, GAME_NICKNAME_MAX),
    gameId: normalizeOptionalText(input.gameId, GAME_ID_MAX),
  };
}

function normalizeInteger(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

export function hasPeakTournamentAccess(peakRank: number): boolean {
  return normalizeInteger(peakRank) >= PEAK_TOURNAMENT_MIN_RANK;
}

export function normalizePeakScore(peakRank: number, peakScore: unknown): number {
  if (!hasPeakTournamentAccess(peakRank)) return 0;
  return Math.max(PEAK_TOURNAMENT_MIN_SCORE, normalizeInteger(peakScore));
}

export function normalizeRolePreferenceSettings(
  preferences: readonly RolePreferenceSettings[],
): RolePreferenceSettings[] {
  const peakRank = preferences.reduce(
    (highest, preference) => Math.max(highest, normalizeInteger(preference.peakRank)),
    0,
  );

  return preferences.map((preference) => ({
    ...preference,
    preferenceRank: normalizeInteger(preference.preferenceRank),
    roleRank: normalizeInteger(preference.roleRank),
    peakRank,
    peakScore: normalizePeakScore(peakRank, preference.peakScore),
  }));
}
