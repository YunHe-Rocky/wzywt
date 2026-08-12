import type { BalanceScore, Player, PlayerRoleMetric, PreferenceSummary, Role, TeamCandidate } from "./types";

export const DEFAULT_UNKNOWN_STRENGTH = 500;
const UNRANKED = 6;

export function comparePreferenceSummary(a: PreferenceSummary, b: PreferenceSummary): number {
  if (a.first !== b.first) return b.first - a.first;
  if (a.second !== b.second) return b.second - a.second;
  if (a.third !== b.third) return b.third - a.third;
  if (a.fourth !== b.fourth) return b.fourth - a.fourth;
  if (a.fifth !== b.fifth) return b.fifth - a.fifth;
  if (a.unranked !== b.unranked) return a.unranked - b.unranked;
  return 0;
}

export function compareBalanceScore(a: BalanceScore, b: BalanceScore): number {
  if (a.totalStrengthDiff !== b.totalStrengthDiff) return a.totalStrengthDiff - b.totalStrengthDiff;
  if (a.laneStrengthDiffSum !== b.laneStrengthDiffSum) return a.laneStrengthDiffSum - b.laneStrengthDiffSum;
  if (a.rankDiff !== b.rankDiff) return a.rankDiff - b.rankDiff;
  if (a.maxLaneStrengthDiff !== b.maxLaneStrengthDiff) return a.maxLaneStrengthDiff - b.maxLaneStrengthDiff;
  return 0;
}

export function compareCandidate(a: TeamCandidate, b: TeamCandidate): number {
  const preferenceOrder = comparePreferenceSummary(a.preference, b.preference);
  if (preferenceOrder !== 0) return preferenceOrder;
  const balanceOrder = compareBalanceScore(a.balance, b.balance);
  if (balanceOrder !== 0) return balanceOrder;
  return a.signature.localeCompare(b.signature, "en");
}

function finiteNonNegative(value: number | undefined): number {
  return Number.isFinite(value) && value! > 0 ? value! : 0;
}

function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function createRawMetric(player: Player, role: Role): PlayerRoleMetric & { rawStrength: number | null } {
  const preference = player.rolePreferences.find((item) => item.roleType === role);
  const preferenceRank = Number.isInteger(preference?.preferenceRank)
    && preference!.preferenceRank >= 1
    && preference!.preferenceRank <= 5
    ? preference!.preferenceRank
    : UNRANKED;
  const powers = (player.heroPowers[role] ?? [])
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const heroPowerScore = powers.length > 0 ? powers.reduce((sum, value) => sum + value, 0) / powers.length : 0;
  const roleRank = finiteNonNegative(preference?.roleRank);
  const peakScore = finiteNonNegative(preference?.peakScore);
  const peakRank = finiteNonNegative(preference?.peakRank);
  const hasKnownStrength = heroPowerScore > 0 || roleRank > 0 || peakScore > 0 || peakRank > 0;
  const rawStrength = hasKnownStrength ? heroPowerScore / 30 + peakScore / 7 + roleRank * 15 + peakRank * 10 : null;

  return {
    playerId: player.userId,
    role,
    preferenceRank,
    strength: rawStrength ?? 0,
    roleRank,
    peakScore,
    heroPowerScore,
    hasKnownStrength,
    hasKnownRank: roleRank > 0,
    rawStrength,
  };
}

export function createMetricMatrix(players: Player[], roles: readonly Role[]): PlayerRoleMetric[][] {
  const raw = players.map((player) => roles.map((role) => createRawMetric(player, role)));
  const neutralStrength = median(
    raw.flatMap((row) => row.flatMap((metric) => metric.rawStrength === null ? [] : [metric.rawStrength])),
    DEFAULT_UNKNOWN_STRENGTH,
  );
  const neutralRank = median(
    raw.flatMap((row) => row.flatMap((metric) => metric.hasKnownRank ? [metric.roleRank] : [])),
    0,
  );

  return raw.map((row) => row.map(({ rawStrength, ...metric }) => ({
    ...metric,
    strength: rawStrength ?? neutralStrength,
    roleRank: metric.hasKnownRank ? metric.roleRank : neutralRank,
  })));
}

export function createPreferenceSummary(counts: ArrayLike<number>): PreferenceSummary {
  return {
    first: counts[0] ?? 0,
    second: counts[1] ?? 0,
    third: counts[2] ?? 0,
    fourth: counts[3] ?? 0,
    fifth: counts[4] ?? 0,
    unranked: counts[5] ?? 0,
  };
}
