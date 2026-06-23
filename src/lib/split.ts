interface Player {
  userId: number;
  rolePreferences: { roleType: string; preferenceRank: number; roleRank: number }[];
  heroPowers: Record<string, number[]>;
  peakPower: number;
}

interface SplitResult {
  teamRed: { userId: number; roleType: string }[];
  teamBlue: { userId: number; roleType: string }[];
  score: number;
  powerDiff: number;
  preferenceScore: number;
  rankDiff: number;
  rankCoverage: number;
}

const ROLES = ["top", "jungle", "mid", "adc", "support"];

// Weights: coverage >> rank balance >> preference >> power
const W_COVER = 100;
const W_RANK = 50;
const W_PREF = 10;
const W_POWER = 1;

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

interface RoleAssignment {
  assignments: { userId: number; roleType: string }[];
}

function generateRoleAssignments(players: Player[]): RoleAssignment[] {
  const n = players.length;
  const perRole = Math.floor(n / 5);
  const remainder = n % 5;
  const results: RoleAssignment[] = [];
  const playerIds = players.map((p) => p.userId);

  function assign(remaining: number[], roleIndex: number, current: { userId: number; roleType: string }[]): void {
    if (roleIndex === 5) {
      if (remaining.length === 0) results.push({ assignments: current });
      return;
    }
    const needed = roleIndex < remainder ? perRole + 1 : perRole;
    if (remaining.length < needed) return;
    const combos = combinations(remaining, needed);
    for (const combo of combos) {
      const nextRemaining = remaining.filter((id) => !combo.includes(id));
      const newAssignments = [...current, ...combo.map((userId) => ({ userId, roleType: ROLES[roleIndex] }))];
      assign(nextRemaining, roleIndex + 1, newAssignments);
    }
  }

  assign(playerIds, 0, []);
  return results;
}

function evaluateTeamSplit(
  roleGroups: Map<string, Player[]>,
  players: Player[]
): { teamRed: { userId: number; roleType: string }[]; teamBlue: { userId: number; roleType: string }[]; powerDiff: number } {
  let bestSplit: { teamRed: any[]; teamBlue: any[]; powerDiff: number } = {
    teamRed: [], teamBlue: [], powerDiff: Infinity,
  };

  for (let mask = 0; mask < 32; mask++) {
    const red: { userId: number; roleType: string }[] = [];
    const blue: { userId: number; roleType: string }[] = [];
    let redPower = 0, bluePower = 0;

    for (let ri = 0; ri < 5; ri++) {
      const role = ROLES[ri];
      const group = roleGroups.get(role) || [];
      if (group.length === 0) continue;

      const playerA = group[0];
      const playerB = group.length > 1 ? group[1] : group[0];
      const assignRedFirst = (mask >> ri) & 1;

      if (assignRedFirst) {
        red.push({ userId: playerA.userId, roleType: role });
        redPower += playerA.peakPower;
        if (group.length > 1) {
          blue.push({ userId: playerB.userId, roleType: role });
          bluePower += playerB.peakPower;
        }
      } else {
        if (group.length > 1) {
          red.push({ userId: playerB.userId, roleType: role });
          redPower += playerB.peakPower;
        }
        blue.push({ userId: playerA.userId, roleType: role });
        bluePower += playerA.peakPower;
      }
    }

    const diff = Math.abs(redPower - bluePower);
    if (diff < bestSplit.powerDiff) {
      bestSplit = { teamRed: red, teamBlue: blue, powerDiff: diff };
    }
  }

  return bestSplit;
}

// ── Scoring ──────────────────────────────────────────────────────────

// Count players placed in a role they have a rank for (roleRank > 0)
function rankCoverage(
  assignments: { userId: number; roleType: string }[],
  players: Player[]
): number {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  let coverage = 0;
  for (const a of assignments) {
    const p = playerMap.get(a.userId);
    const pref = p?.rolePreferences.find((pr) => pr.roleType === a.roleType);
    if (pref && pref.roleRank > 0) coverage++;
  }
  return coverage;
}

// Rank balance: how close are Red and Blue rank sums
function rankDiff(
  teamRed: { userId: number; roleType: string }[],
  teamBlue: { userId: number; roleType: string }[],
  players: Player[]
): number {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  let redSum = 0, blueSum = 0;
  for (const a of teamRed) {
    const p = playerMap.get(a.userId);
    redSum += p?.rolePreferences.find((pr) => pr.roleType === a.roleType)?.roleRank || 0;
  }
  for (const a of teamBlue) {
    const p = playerMap.get(a.userId);
    blueSum += p?.rolePreferences.find((pr) => pr.roleType === a.roleType)?.roleRank || 0;
  }
  return Math.abs(redSum - blueSum);
}

// Preference satisfaction
function preferenceScore(
  assignments: { userId: number; roleType: string }[],
  players: Player[]
): number {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  let total = 0;
  for (const a of assignments) {
    const p = playerMap.get(a.userId);
    if (!p) continue;
    const pref = p.rolePreferences.find((pr) => pr.roleType === a.roleType);
    if (pref) total += 6 - pref.preferenceRank; // rank 1 = 5pts, rank 5 = 1pt
  }
  return total;
}

// ── Main ─────────────────────────────────────────────────────────────

export function splitTeams(players: Player[]): SplitResult | null {
  if (players.length < 10) return null;

  // Only use 10 players for 5v5, extra players are unassigned
  const selected = players.slice(0, 10);

  const roleAssignments = generateRoleAssignments(selected);
  let bestResult: SplitResult | null = null;
  let bestScore = -Infinity;
  const playerMap = new Map(selected.map((p) => [p.userId, p]));

  for (const ra of roleAssignments) {
    const roleGroups = new Map<string, Player[]>();
    for (const a of ra.assignments) {
      const p = playerMap.get(a.userId)!;
      if (!roleGroups.has(a.roleType)) roleGroups.set(a.roleType, []);
      roleGroups.get(a.roleType)!.push(p);
    }

    const split = evaluateTeamSplit(roleGroups, selected);
    const allAssignments = [...split.teamRed, ...split.teamBlue];
    const coverage = rankCoverage(allAssignments, players);
    const rDiff = rankDiff(split.teamRed, split.teamBlue, players);
    const pref = preferenceScore(allAssignments, players);

    // coverage (higher=better) + rank balance (lower diff=better) + pref (higher=better) + power (lower=better)
    const score = coverage * W_COVER + (-rDiff) * W_RANK + pref * W_PREF + (-split.powerDiff) * W_POWER;

    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        teamRed: split.teamRed,
        teamBlue: split.teamBlue,
        score,
        powerDiff: split.powerDiff,
        preferenceScore: pref,
        rankDiff: rDiff,
        rankCoverage: coverage,
      };
    }
  }

  return bestResult;
}
