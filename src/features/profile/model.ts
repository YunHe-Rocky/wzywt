import { ROLES } from "@/core/game/constants";

export interface GameProfile {
  gameNickname: string | null;
  gameId: string | null;
}

export function parseRolePreferences(value: unknown): RolePreferenceSettings[] {
  if (!Array.isArray(value) || value.length !== 5) throw new RangeError("必须为全部 5 个分路设置偏好");
  const roles = new Set<string>(); const ranks = new Set<number>();
  const integer = (input: unknown, max: number, label: string, min = 0) => {
    if (typeof input !== "number" || !Number.isSafeInteger(input) || input < min || input > max) throw new RangeError(`${label}必须为 ${min}-${max} 的整数`);
    return input;
  };
  const preferences = value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("分路偏好格式错误");
    const role = item.role_type;
    if (typeof role !== "string" || !ROLES.some(allowed => allowed === role) || roles.has(role)) throw new RangeError("分路必须恰好覆盖五路且不能重复");
    const preferenceRank = integer(item.preference_rank, 5, "志愿", 1);
    if (ranks.has(preferenceRank)) throw new RangeError("志愿必须是 1-5 的不重复排列");
    roles.add(role); ranks.add(preferenceRank);
    return { roleType: role, preferenceRank,
      roleRank: integer(item.role_rank ?? 0, 10, "分路段位"),
      peakRank: integer(item.peak_rank ?? 0, 10, "最高段位"),
      peakScore: integer(item.peak_score ?? 0, 9999, "巅峰分数") };
  });
  return normalizeRolePreferenceSettings(preferences);
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
